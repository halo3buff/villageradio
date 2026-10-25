'use client';
import { createContext, useContext, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Mix } from '@/lib/types';
import { positionAt, secondsIntoDay, type Segment } from '@/lib/content/broadcast';
import { trimDb } from '@/lib/audio/loudness';

type AudioMode = 'idle' | 'broadcast' | 'individual';

interface AudioCtx {
  playlist: Mix[];
  currentTrack: Mix | null;
  isPlaying: boolean;
  /** Dead air: the broadcast stream errored or stalled >2.5s while tuned in. */
  carrierLost: boolean;
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

// --- Drift correction tuning -------------------------------------------------
// The broadcast position is derived from the clock (Date.now()), anchored to midnight in
// BROADCAST_TZ, so it is identical for every listener at a given instant.
// The only per-user variance is a *wrong* device clock, corrected by the server
// offset. These constants govern how we gently re-converge during a session.
const HARD_SEEK_SEC       = 1.5;        // drift past this gets a fade-covered seek; less is inaudible on radio
const CORRECT_INTERVAL_MS = 5 * 60_000; // how often to check for drift
const TIME_REFRESH_MS     = 10 * 60_000;// how often to re-fetch the server clock offset


// Fetches the server's clock and returns how many milliseconds ahead/behind
// the local clock is. Refreshed periodically during long sessions so a slowly
// drifting device clock can't pull a listener out of sync.
async function fetchServerOffsetMs(): Promise<number> {
  const t0 = Date.now();
  const res = await fetch('/api/time');
  const t1 = Date.now();
  const { t: serverTime } = await res.json() as { t: number };
  // serverTime is the server's Date.now() mid-request; approximate with half RTT
  return serverTime + (t1 - t0) / 2 - t1;
}

// What's on air now (idx -1 = scheduled silence), how far in, and when this play ends —
// all in seconds of the broadcast day. offsetMs corrects for a skewed local clock.
function getBroadcastPosition(segments: Segment[], offsetMs: number) {
  const sec = secondsIntoDay(Date.now() + offsetMs);
  return { ...positionAt(segments, sec), sec };
}

export function AudioProvider({ children, playlist, segments }: { children: React.ReactNode; playlist: Mix[]; segments: Segment[] }) {
  // The day's segments index into `playlist`. Timers and callbacks outlive renders, so they read
  // both through refs — a refreshed lineup (see below) reaches a broadcast that's already playing.
  const broadcastRef = useRef(playlist);
  broadcastRef.current = playlist;
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const router = useRouter();
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const webCtxRef       = useRef<AudioContext | null>(null);
  const gainNodeRef     = useRef<GainNode | null>(null);
  const volumeRef       = useRef(0.8);
  const modeRef         = useRef<AudioMode>('idle');
  const broadcastIdxRef = useRef(0);
  const silentRef       = useRef(false); // tuned in, but the schedule says silence right now
  const boundaryRef     = useRef<ReturnType<typeof setTimeout> | null>(null); // fires when this play / silence ends
  const serverOffsetRef = useRef<number | null>(null);  // ms to add to Date.now() for server-accurate time
  const trimNodeRef     = useRef<GainNode | null>(null); // per-track loudness trim (see loudness.ts)
  const trimRef         = useRef(1);
  const correctTimerRef = useRef<ReturnType<typeof setInterval> | null>(null); // periodic drift check
  const timeRefreshRef  = useRef<ReturnType<typeof setInterval> | null>(null); // periodic server-clock refresh

  const [currentTrack,  setCurrentTrack]  = useState<Mix | null>(null);
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [carrierLost,   setCarrierLost]   = useState(false);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mode,          setMode]          = useState<AudioMode>('idle');
  const [broadcastIndex,setBroadcastIndex]= useState(0);
  const [progress,      setProgress]      = useState(0);
  const [analyserL,     setAnalyserL]     = useState<AnalyserNode | null>(null);
  const [analyserR,     setAnalyserR]     = useState<AnalyserNode | null>(null);
  const [analyserFreq,  setAnalyserFreq]  = useState<AnalyserNode | null>(null);
  const [volume,        setVolumeState]   = useState(0.8);

  // A new lineup (published from the admin, pulled in by router.refresh): adopt its timings
  // and, if the broadcast is on, re-tune to wherever the new day says we should be.
  const lineupKey = JSON.stringify(segments.map(g => [g.start, g.end, g.loop, playlist[g.idx]?.src]));
  const lineupRef = useRef(lineupKey);
  useEffect(() => {
    if (lineupRef.current === lineupKey) return;
    lineupRef.current = lineupKey;
    if (modeRef.current === 'broadcast' && audioRef.current && (silentRef.current || !audioRef.current.paused)) {
      fadeOutThen(() => { tuneIntoBroadcast(); fadeIn(); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupKey]);

  // Pre-fetch server clock offset on mount so the first broadcastPlay() tap
  // has no network round-trip delay — it can compute broadcast position instantly.
  useEffect(() => {
    fetchServerOffsetMs()
      .then(offset => { serverOffsetRef.current = offset; })
      .catch(() => {});
  }, []);

  // Warm the broadcast pipeline on mount so the first tap starts near-instantly:
  //  1) point the (paused) element at the on-air track/offset — browsers that
  //     honour preload buffer the exact region the tap will need, and
  //  2) pull a small byte range at that position through /api/audio/stream,
  //     which opens the browser→server and server→R2 connections and warms the
  //     caches along the path. iOS ignores element preload before a gesture,
  //     so (2) is what cuts the tap latency on iPhones.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {

        // Give the server-clock prefetch a moment; fall back to the local clock.
        for (let i = 0; i < 20 && serverOffsetRef.current === null; i++) {
          await new Promise(r => setTimeout(r, 100));
        }
        if (cancelled || modeRef.current !== 'idle') return;

        const { idx, offset: offsetSec } = getBroadcastPosition(segmentsRef.current, serverOffsetRef.current ?? 0);
        const track = broadcastRef.current[idx];
        if (!track?.durationSec) return; // silence now — nothing to warm

        // (1) element priming — buffers at the broadcast offset where allowed
        const audio = getOrCreateAudio();
        if (!audio.src) {
          audio.preload = 'auto';
          audio.src = `${track.src}#t=${offsetSec.toFixed(2)}`;
          audio.load();
        }

        // (2) connection + cache warmup at the estimated byte position
        const probe = await fetch(track.src, { headers: { Range: 'bytes=0-1' } });
        const total = Number(probe.headers.get('Content-Range')?.split('/')[1] ?? 0);
        if (!total || cancelled || modeRef.current !== 'idle') return;
        const byteStart = Math.floor(total * (offsetSec / track.durationSec));
        await fetch(track.src, { headers: { Range: `bytes=${byteStart}-${byteStart + 196607}` } });
      } catch { /* warmup is best-effort — the tap path works without it */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupKey]);

  function getOrCreateAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const a = new Audio();
      a.crossOrigin = 'anonymous';
      // The station always plays at exactly 1× — nothing here ever changes the rate. Some
      // media-speed browser extensions force a remembered rate (e.g. 0.9×) onto every
      // <audio>/<video>, which would make the stream play slow: snap any such change back,
      // including the default rate a new src load would otherwise pick up.
      a.preservesPitch = true;
      const pin = () => {
        if (a.defaultPlaybackRate !== 1) a.defaultPlaybackRate = 1;
        if (a.playbackRate !== 1) a.playbackRate = 1;
      };
      pin();
      a.addEventListener('ratechange', pin);
      a.addEventListener('loadstart', pin);
      a.addEventListener('playing', pin);
      // Dead-air watch: a buffering hiccup gets a 2.5s grace period before the
      // scope declares NO CARRIER; an outright error declares it immediately.
      // Any resumed playback clears the state.
      const armStall = () => {
        if (modeRef.current !== 'broadcast') return;
        if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
        stallTimerRef.current = setTimeout(() => setCarrierLost(true), 2500);
      };
      const clearStall = () => {
        if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
        setCarrierLost(false);
      };
      a.addEventListener('waiting', armStall);
      a.addEventListener('stalled', armStall);
      a.addEventListener('playing', clearStall);
      a.addEventListener('error', () => {
        if (modeRef.current === 'broadcast') setCarrierLost(true);
      });
      // Pauses we didn't make (media keys, headphones unplugged, the OS taking audio focus):
      // follow them so the transport never shows "playing" over silence. Deferred, and only
      // with data buffered, because track switches and re-tunes pause the element briefly.
      a.addEventListener('pause', () => {
        setTimeout(() => {
          if (a.paused && !a.ended && a.readyState >= 3 && !silentRef.current) pause();
        }, 1500);
      });
      audioRef.current = a;
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
    // The audio runs through this context, so if the OS suspends it the station is silent:
    // pause the element, which the listener above turns into a proper pause.
    ctx.onstatechange = () => {
      if (ctx.state !== 'running' && !audio.paused) audio.pause();
    };

    const source   = ctx.createMediaElementSource(audio);
    const splitter = ctx.createChannelSplitter(2);

    const aL = ctx.createAnalyser(); aL.fftSize = 2048; aL.smoothingTimeConstant = 0.0;
    const aR = ctx.createAnalyser(); aR.fftSize = 2048; aR.smoothingTimeConstant = 0.0;
    const aFreq = ctx.createAnalyser(); aFreq.fftSize = 4096; aFreq.smoothingTimeConstant = 0.75;

    const gain = ctx.createGain();
    gain.gain.value = volumeRef.current;
    gainNodeRef.current = gain;
    const trim = ctx.createGain();
    trim.gain.value = trimRef.current;
    trimNodeRef.current = trim;

    // Analysers tap pre-gain so volume doesn't affect visualiser levels
    source.connect(splitter);
    splitter.connect(aL, 0);
    splitter.connect(aR, 1);
    source.connect(aFreq);

    // Analysers read the file as mastered; listeners hear it trimmed to the common level.
    source.connect(trim);
    trim.connect(gain);
    gain.connect(ctx.destination);

    setAnalyserL(aL); setAnalyserR(aR); setAnalyserFreq(aFreq);
  }

  /** Loudness-normalise: loud masters play at the -14 LUFS everyone else is at. */
  function applyTrim(track: Mix) {
    trimRef.current = 10 ** (trimDb(track.lufs) / 20);
    if (trimNodeRef.current) trimNodeRef.current.gain.value = trimRef.current;
  }

  function setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    if (gainNodeRef.current) gainNodeRef.current.gain.value = clamped;
    setVolumeState(clamped);
  }

  function wireBroadcastTrack(idx: number) {
    const audio = audioRef.current!;
    const track = broadcastRef.current[idx];
    if (!track) return;

    broadcastIdxRef.current = idx;
    setBroadcastIndex(idx);
    setCurrentTrack(track);
    applyTrim(track);

    audio.ontimeupdate = () => {
      const a = audioRef.current!;
      setProgress(a.currentTime / a.duration || 0);
    };
    audio.onerror = () => setIsPlaying(false);

    // the clock decides what follows: a repeat, the next block, filler or silence
    audio.onended = () => { if (modeRef.current === 'broadcast') tuneIntoBroadcast(); };
  }

  // Seek without overshooting the end (setting currentTime past duration is a no-op on some browsers)
  function safeSeek(audio: HTMLAudioElement, sec: number) {
    audio.currentTime = sec > 0
      ? Math.min(sec, isFinite(audio.duration) ? audio.duration - 1 : sec)
      : 0;
  }

  async function tuneIntoBroadcast() {
    const audio = audioRef.current!;
    // Fetch server time once per session to correct for skewed device clocks
    if (serverOffsetRef.current === null) {
      serverOffsetRef.current = await fetchServerOffsetMs();
    }

    const { idx: trackIdx, offset: offsetSec, until, sec } = getBroadcastPosition(segmentsRef.current, serverOffsetRef.current);
    // Re-tune the moment this play (or silence) ends: filler cut off by the next block,
    // a repeat starting over, the midnight turnover.
    if (boundaryRef.current) clearTimeout(boundaryRef.current);
    boundaryRef.current = setTimeout(() => {
      if (modeRef.current !== 'broadcast') return;
      fadeOutThen(() => { tuneIntoBroadcast(); fadeIn(); });
    }, Math.max(0, (until - sec) * 1000) + 30);

    const track = broadcastRef.current[trackIdx];
    if (!track) {
      // Scheduled silence: stay tuned in (the transport still reads ON AIR) with the element idle.
      silentRef.current = true;
      audio.pause();
      setCurrentTrack(null);
      setIsPlaying(true);
      console.log('[VR broadcast] silence until', Math.round(until));
      return;
    }
    silentRef.current = false;

    console.log('[VR broadcast]', {
      trackTitle: track.title,
      seek: Math.round(offsetSec),
      serverOffsetMs: Math.round(serverOffsetRef.current),
    });

    wireBroadcastTrack(trackIdx);

    // Fast path: the mount-time warmup already pointed the element at this
    // track and (on preload-friendly browsers) buffered around the broadcast
    // position. If metadata is in, a direct seek lands in/near that buffer —
    // do NOT reset src, that would discard the primed data.
    const trackHref = new URL(track.src, window.location.href).href;
    const sameTrack = audio.src.split('#')[0] === trackHref;
    if (sameTrack && audio.readyState >= 1 /* HAVE_METADATA */) {
      safeSeek(audio, offsetSec);
    } else {
      // Media-fragment start (#t=offset): the browser opens its FIRST range
      // request directly at the broadcast position, instead of the slow path
      // of load → canplay → seek → re-buffer (two network round-trips).
      audio.src = `${trackHref}#t=${offsetSec.toFixed(2)}`;
      audio.load();
    }
    // play() immediately — it resolves as soon as data at the offset arrives.
    audio.play().catch(() => setIsPlaying(false));
    setIsPlaying(true);

    // Verify the landing position once playable — if the browser ignored the
    // fragment (or buffering took long enough to drift), correct with a seek
    // against a freshly computed broadcast position.
    audio.oncanplay = () => {
      audio.oncanplay = null;
      if (serverOffsetRef.current === null) return;
      const now = getBroadcastPosition(segmentsRef.current, serverOffsetRef.current);
      if (now.idx === broadcastIdxRef.current && Math.abs(audio.currentTime - now.offset) > HARD_SEEK_SEC) {
        safeSeek(audio, now.offset);
      }
    };
  }

  // Briefly dip the gain to ~silence, run `action` (a seek/re-tune) while muted,
  // then ramp back. Hides the click/stall a hard seek would otherwise produce.
  function fadeOutThen(action: () => void) {
    const gain = gainNodeRef.current;
    const ctx  = webCtxRef.current;
    if (!gain || !ctx) { action(); return; }
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.08);
    setTimeout(action, 90);
  }

  function fadeIn() {
    const gain = gainNodeRef.current;
    const ctx  = webCtxRef.current;
    if (!gain || !ctx) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volumeRef.current, now + 0.12);
  }

  // Periodic check: how far is actual playback from where the broadcast clock says
  // it should be? Large drift or wrong track → fade-covered seek/re-tune (rare;
  // mainly after a long stall). Playback speed is never touched.
  function correctDrift() {
    if (modeRef.current !== 'broadcast') return;
    const audio = audioRef.current;
    if (!audio || serverOffsetRef.current === null) return;
    const expected = getBroadcastPosition(segmentsRef.current, serverOffsetRef.current);
    // silent but something should be playing (the boundary timer is the primary path)
    if (silentRef.current) { if (expected.idx !== -1) tuneIntoBroadcast(); return; }
    if (audio.paused) return;

    // On the wrong track entirely — re-derive from the clock, hidden behind a gain dip
    if (expected.idx !== broadcastIdxRef.current) {
      fadeOutThen(() => { tuneIntoBroadcast(); fadeIn(); });
      console.log('[VR broadcast] resync: wrong track → re-tune');
      return;
    }

    const drift = expected.offset - audio.currentTime; // +behind / -ahead
    const absDrift = Math.abs(drift);

    if (absDrift > HARD_SEEK_SEC) {
      fadeOutThen(() => { safeSeek(audio, expected.offset); fadeIn(); });
      console.log('[VR broadcast] resync: hard seek', { drift: +drift.toFixed(2) });
    }
  }

  function startBroadcastTimers() {
    stopBroadcastTimers();
    correctTimerRef.current = setInterval(correctDrift, CORRECT_INTERVAL_MS);
    timeRefreshRef.current  = setInterval(async () => {
      try { serverOffsetRef.current = await fetchServerOffsetMs(); } catch { /* keep last offset */ }
      router.refresh(); // long listens pick up newly published lineups too
    }, TIME_REFRESH_MS);
  }

  function stopBroadcastTimers() {
    if (correctTimerRef.current) { clearInterval(correctTimerRef.current); correctTimerRef.current = null; }
    if (timeRefreshRef.current)  { clearInterval(timeRefreshRef.current);  timeRefreshRef.current  = null; }
    if (boundaryRef.current)     { clearTimeout(boundaryRef.current);      boundaryRef.current     = null; }
    silentRef.current = false;
  }

  function broadcastPlay() {
    const audio = getOrCreateAudio();
    modeRef.current = 'broadcast';
    setMode('broadcast');
    // Optimistic: flip the UI on the tap itself (scope leaves idle mode
    // instantly) — audio follows as soon as the stream buffers. onerror and
    // the play() rejection handler roll this back if tuning fails.
    setIsPlaying(true);
    setCarrierLost(false); // fresh tune-in — give the carrier a clean slate
    initWebAudio(audio);
    startBroadcastTimers(); // first: it clears the boundary timer that tuning sets
    tuneIntoBroadcast();
    router.refresh(); // pick up a lineup published since this page loaded
  }

  function play(track: Mix) {
    const audio = getOrCreateAudio();
    stopBroadcastTimers(); // leaving the broadcast — stop drift correction
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
    applyTrim(track);
    setIsPlaying(true);
    audio.play().catch(() => setIsPlaying(false));
  }

  function pause() {
    audioRef.current?.pause();
    stopBroadcastTimers(); // resume re-tunes from scratch, so no need to keep checking while paused
    setIsPlaying(false);
    // Chosen silence is not dead air
    if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
    setCarrierLost(false);
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
      playlist,
      currentTrack, isPlaying, carrierLost, mode, broadcastIndex,
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
