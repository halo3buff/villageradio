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

// Probe a single audio file's duration via metadata — no full download needed
function probeAudioDuration(src: string): Promise<number> {
  return new Promise(resolve => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
    a.src = src;
  });
}

// Given probed durations and the current wall-clock time, return which track
// is "on air" right now and how many seconds into it we are.
function getBroadcastPosition(durations: number[]): { trackIdx: number; offsetSec: number } {
  const total = durations.reduce((a, b) => a + b, 0);
  if (total === 0) return { trackIdx: 0, offsetSec: 0 };

  let offset = (Date.now() / 1000) % total;
  for (let i = 0; i < durations.length; i++) {
    if (offset < durations[i]) return { trackIdx: i, offsetSec: offset };
    offset -= durations[i];
  }
  return { trackIdx: 0, offsetSec: 0 };
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const webCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const volumeRef = useRef(0.8);
  const modeRef = useRef<AudioMode>('idle');
  const broadcastIdxRef = useRef(0);
  // Cache probed durations so we only fetch metadata once per session
  const durationsRef = useRef<number[] | null>(null);

  const [currentTrack, setCurrentTrack] = useState<Mix | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<AudioMode>('idle');
  const [broadcastIndex, setBroadcastIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [analyserL, setAnalyserL] = useState<AnalyserNode | null>(null);
  const [analyserR, setAnalyserR] = useState<AnalyserNode | null>(null);
  const [analyserFreq, setAnalyserFreq] = useState<AnalyserNode | null>(null);
  const [volume, setVolumeState] = useState(0.8);

  function getOrCreateAudio(): HTMLAudioElement {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  }

  function initWebAudio(audio: HTMLAudioElement) {
    if (webCtxRef.current) {
      if (webCtxRef.current.state === 'suspended') webCtxRef.current.resume();
      return;
    }
    const ctx = new AudioContext();
    webCtxRef.current = ctx;

    const source = ctx.createMediaElementSource(audio);
    const splitter = ctx.createChannelSplitter(2);

    const aL = ctx.createAnalyser();
    aL.fftSize = 2048;
    aL.smoothingTimeConstant = 0.0;

    const aR = ctx.createAnalyser();
    aR.fftSize = 2048;
    aR.smoothingTimeConstant = 0.0;

    const aFreq = ctx.createAnalyser();
    aFreq.fftSize = 4096;
    aFreq.smoothingTimeConstant = 0.75;

    const gain = ctx.createGain();
    gain.gain.value = volumeRef.current;
    gainNodeRef.current = gain;

    // Analysers tap directly from source — unaffected by volume
    source.connect(splitter);
    splitter.connect(aL, 0);
    splitter.connect(aR, 1);
    source.connect(aFreq);

    // Output path goes through gain node so volume control works
    source.connect(gain);
    gain.connect(ctx.destination);

    setAnalyserL(aL);
    setAnalyserR(aR);
    setAnalyserFreq(aFreq);
  }

  function setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    if (gainNodeRef.current) gainNodeRef.current.gain.value = clamped;
    setVolumeState(clamped);
  }

  function wireBroadcastTrack(idx: number, seekTo: number | null) {
    const audio = audioRef.current!;
    const track = broadcastPlaylist[idx];
    if (!track) return;

    broadcastIdxRef.current = idx;
    setBroadcastIndex(idx);
    setCurrentTrack(track);
    audio.src = track.src;

    audio.ontimeupdate = () => {
      const a = audioRef.current!;
      setProgress(a.currentTime / a.duration || 0);
    };
    audio.onerror = () => setIsPlaying(false);

    // Auto-advance to next track in broadcast mode
    audio.onended = () => {
      if (modeRef.current !== 'broadcast') return;
      const nextIdx = (broadcastIdxRef.current + 1) % broadcastPlaylist.length;
      const nextTrack = broadcastPlaylist[nextIdx];
      broadcastIdxRef.current = nextIdx;
      setBroadcastIndex(nextIdx);
      setCurrentTrack(nextTrack);
      audio.src = nextTrack.src;
      audio.play().catch(() => setIsPlaying(false));
    };

    if (seekTo !== null && seekTo > 0) {
      audio.addEventListener('canplay', function handler() {
        audio.currentTime = Math.min(seekTo, audio.duration - 1);
        audio.removeEventListener('canplay', handler);
      });
    }
  }

  async function tuneIntoBroadcast() {
    const audio = audioRef.current!;

    // Probe durations once and cache them
    if (!durationsRef.current) {
      durationsRef.current = await Promise.all(
        broadcastPlaylist.map(t => probeAudioDuration(t.src))
      );
    }

    const { trackIdx, offsetSec } = getBroadcastPosition(durationsRef.current);
    wireBroadcastTrack(trackIdx, offsetSec);
    audio.play().catch(() => setIsPlaying(false));
    setIsPlaying(true);
  }

  function broadcastPlay() {
    const audio = getOrCreateAudio();

    modeRef.current = 'broadcast';
    setMode('broadcast');
    initWebAudio(audio);

    // Always tune to the current broadcast position — never resume from pause
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
    audio.onerror = () => setIsPlaying(false);
    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTrack(null);
    };
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
      // Rejoin the broadcast at its current live position
      broadcastPlay();
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
