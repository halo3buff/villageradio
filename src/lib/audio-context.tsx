'use client';
import { createContext, useContext, useRef, useState } from 'react';
import type { Mix } from '@/lib/types';
import { broadcastPlaylist } from '@/lib/data/mixes';

type AudioMode = 'idle' | 'broadcast' | 'individual';

interface AudioCtx {
  currentTrack: Mix | null;
  isPlaying: boolean;
  mode: AudioMode;
  broadcastIndex: number;
  play: (track: Mix) => void;
  broadcastPlay: () => void;
  pause: () => void;
  toggle: () => void;
  progress: number;
  analyserL: AnalyserNode | null;
  analyserR: AnalyserNode | null;
  analyserFreq: AnalyserNode | null;
  volume: number;
  setVolume: (v: number) => void;
}

const PlayerContext = createContext<AudioCtx | null>(null);

// Returns hardcoded durationSec instantly; falls back to a metadata probe for unknowns
function getDuration(track: Mix): Promise<number> {
  if (track.durationSec && track.durationSec > 0) return Promise.resolve(track.durationSec);
  return new Promise(resolve => {
    const a = new Audio();
    a.crossOrigin = 'anonymous';
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
    a.src = track.src;
  });
}

// Fetches the server's clock and returns how many milliseconds ahead/behind
// the local clock is. One fetch per session; result is cached in the caller.
async function fetchServerOffsetMs(): Promise<number> {
  const t0 = Date.now();
  const res = await fetch('/api/time');
  const t1 = Date.now();
  const { t: serverTime } = await res.json() as { t: number };
  // serverTime is the server's Date.now() mid-request; approximate with half RTT
  return serverTime + (t1 - t0) / 2 - t1;
}

// Returns which track is currently "on air" and how many seconds into it.
// offsetMs corrects for a skewed local clock (from fetchServerOffsetMs).
function getBroadcastPosition(durations: number[], offsetMs: number): { trackIdx: number; offsetSec: number } {
  const total = durations.reduce((a, b) => a + b, 0);
  if (total === 0) return { trackIdx: 0, offsetSec: 0 };

  let elapsed = ((Date.now() + offsetMs) / 1000) % total;
  for (let i = 0; i < durations.length; i++) {
    if (elapsed < durations[i]) return { trackIdx: i, offsetSec: elapsed };
    elapsed -= durations[i];
  }
  return { trackIdx: 0, offsetSec: 0 };
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const webCtxRef       = useRef<AudioContext | null>(null);
  const gainNodeRef     = useRef<GainNode | null>(null);
  const volumeRef       = useRef(0.8);
  const modeRef         = useRef<AudioMode>('idle');
  const broadcastIdxRef = useRef(0);
  const durationsRef    = useRef<number[] | null>(null); // cached on first broadcastPlay
  const serverOffsetRef = useRef<number | null>(null);  // ms to add to Date.now() for server-accurate time

  const [currentTrack,  setCurrentTrack]  = useState<Mix | null>(null);
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [mode,          setMode]          = useState<AudioMode>('idle');
  const [broadcastIndex,setBroadcastIndex]= useState(0);
  const [progress,      setProgress]      = useState(0);
  const [analyserL,     setAnalyserL]     = useState<AnalyserNode | null>(null);
  const [analyserR,     setAnalyserR]     = useState<AnalyserNode | null>(null);
  const [analyserFreq,  setAnalyserFreq]  = useState<AnalyserNode | null>(null);
  const [volume,        setVolumeState]   = useState(0.8);

  function getOrCreateAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.crossOrigin = 'anonymous';
    }
    return audioRef.current;
  }

  function initWebAudio(audio: HTMLAudioElement) {
    if (webCtxRef.current) {
      if (webCtxRef.current.state === 'suspended') webCtxRef.current.resume();
      return;
    }
    const ctx = new AudioContext();
    webCtxRef.current = ctx;

    const source   = ctx.createMediaElementSource(audio);
    const splitter = ctx.createChannelSplitter(2);

    const aL = ctx.createAnalyser(); aL.fftSize = 2048; aL.smoothingTimeConstant = 0.0;
    const aR = ctx.createAnalyser(); aR.fftSize = 2048; aR.smoothingTimeConstant = 0.0;
    const aFreq = ctx.createAnalyser(); aFreq.fftSize = 4096; aFreq.smoothingTimeConstant = 0.75;

    const gain = ctx.createGain();
    gain.gain.value = volumeRef.current;
    gainNodeRef.current = gain;

    // Analysers tap pre-gain so volume doesn't affect visualiser levels
    source.connect(splitter);
    splitter.connect(aL, 0);
    splitter.connect(aR, 1);
    source.connect(aFreq);

    source.connect(gain);
    gain.connect(ctx.destination);

    setAnalyserL(aL); setAnalyserR(aR); setAnalyserFreq(aFreq);
  }

  function setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    if (gainNodeRef.current) gainNodeRef.current.gain.value = clamped;
    setVolumeState(clamped);
  }

  function wireBroadcastTrack(idx: number) {
    const audio = audioRef.current!;
    const track = broadcastPlaylist[idx];
    if (!track) return;

    broadcastIdxRef.current = idx;
    setBroadcastIndex(idx);
    setCurrentTrack(track);

    audio.ontimeupdate = () => {
      const a = audioRef.current!;
      setProgress(a.currentTime / a.duration || 0);
    };
    audio.onerror = () => setIsPlaying(false);

    audio.onended = () => {
      if (modeRef.current !== 'broadcast') return;
      const nextIdx = (broadcastIdxRef.current + 1) % broadcastPlaylist.length;
      const next = broadcastPlaylist[nextIdx];
      broadcastIdxRef.current = nextIdx;
      setBroadcastIndex(nextIdx);
      setCurrentTrack(next);
      audio.src = next.src;
      audio.play().catch(() => setIsPlaying(false));
    };
  }

  async function tuneIntoBroadcast() {
    const audio = audioRef.current!;

    // All tracks have durationSec hardcoded — resolves instantly, no network requests
    if (!durationsRef.current) {
      durationsRef.current = await Promise.all(broadcastPlaylist.map(getDuration));
    }

    // Fetch server time once per session to correct for skewed device clocks
    if (serverOffsetRef.current === null) {
      serverOffsetRef.current = await fetchServerOffsetMs();
    }

    const { trackIdx, offsetSec } = getBroadcastPosition(durationsRef.current, serverOffsetRef.current);
    const totalDuration = durationsRef.current.reduce((a, b) => a + b, 0);

    console.log('[VR broadcast]', {
      trackTitle: broadcastPlaylist[trackIdx].title,
      seek: Math.round(offsetSec),
      totalDuration: Math.round(totalDuration),
      elapsed: Math.round(((Date.now() + serverOffsetRef.current) / 1000) % totalDuration),
      serverOffsetMs: Math.round(serverOffsetRef.current),
    });

    wireBroadcastTrack(trackIdx);

    // Seek and play must happen inside canplay — setting currentTime before the
    // element is ready silently fails, causing playback to start from position 0.
    const seekTo = offsetSec;
    audio.oncanplay = () => {
      audio.oncanplay = null;
      audio.currentTime = seekTo > 0
        ? Math.min(seekTo, isFinite(audio.duration) ? audio.duration - 1 : seekTo)
        : 0;
      audio.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    };

    audio.src = broadcastPlaylist[trackIdx].src;
    audio.load();
  }

  function broadcastPlay() {
    const audio = getOrCreateAudio();
    modeRef.current = 'broadcast';
    setMode('broadcast');
    initWebAudio(audio);
    tuneIntoBroadcast();
  }

  function play(track: Mix) {
    const audio = getOrCreateAudio();
    modeRef.current = 'individual';
    setMode('individual');
    audio.src = track.src;
    audio.ontimeupdate = () => {
      const a = audioRef.current!;
      setProgress(a.currentTime / a.duration || 0);
    };
    audio.onerror  = () => setIsPlaying(false);
    audio.onended  = () => { setIsPlaying(false); setCurrentTrack(null); };
    initWebAudio(audio);
    setCurrentTrack(track);
    setIsPlaying(true);
    audio.play().catch(() => setIsPlaying(false));
  }

  function pause() {
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  function toggle() {
    if (isPlaying) {
      pause();
    } else if (modeRef.current === 'broadcast') {
      broadcastPlay(); // rejoin broadcast at current wall-clock position
    } else if (audioRef.current) {
      if (webCtxRef.current?.state === 'suspended') webCtxRef.current.resume();
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }

  return (
    <PlayerContext.Provider value={{
      currentTrack, isPlaying, mode, broadcastIndex,
      play, broadcastPlay, pause, toggle, progress,
      analyserL, analyserR, analyserFreq,
      volume, setVolume,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}
