'use client';
import { createContext, useContext, useRef, useState, useEffect, useMemo } from 'react';
import type { Mix } from '@/lib/types';

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
// The broadcast position is derived from the UTC epoch clock (Date.now()), so it
// is identical for every listener at a given instant — timezone never matters.
// The only per-user variance is a *wrong* device clock, corrected by the server
// offset. These constants govern how we gently re-converge during a session.
const NUDGE_THRESHOLD_SEC = 0.25;       // ignore drift smaller than this
const HARD_SEEK_SEC       = 1.5;        // above this, fade + seek instead of nudging
const RATE_WINDOW_SEC     = 30;         // absorb a rate nudge over this many seconds
const RATE_MAX            = 0.03;       // cap playbackRate change at ±3% (imperceptible)
const CORRECT_INTERVAL_MS = 5 * 60_000; // how often to check for drift
const TIME_REFRESH_MS     = 10 * 60_000;// how often to re-fetch the server clock offset

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

export function AudioProvider({ children, playlist }: { children: React.ReactNode; playlist: Mix[] }) {
  // Hidden tracks stay in the archive/sidebar (full `playlist`) but drop out of the live
  // rotation's order and timing — `broadcast` is what tuneIntoBroadcast/correctDrift walk.
  const broadcast = useMemo(() => playlist.filter(t => !t.hidden), [playlist]);
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const webCtxRef       = useRef<AudioContext | null>(null);
  const gainNodeRef     = useRef<GainNode | null>(null);
  const volumeRef       = useRef(0.8);
  const modeRef         = useRef<AudioMode>('idle');
  const broadcastIdxRef = useRef(0);
  const durationsRef    = useRef<number[] | null>(null); // cached on first broadcastPlay
  const serverOffsetRef = useRef<number | null>(null);  // ms to add to Date.now() for server-accurate time
  const rateResetRef    = useRef<ReturnType<typeof setTimeout>  | null>(null); // resets playbackRate after a nudge
  const intendedRateRef = useRef(1); // the rate WE want — guards against external overrides (e.g. speed-control browser extensions)
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
        const durations = broadcast.map(t => t.durationSec || 0);
        if (durations.length === 0 || durations.some(d => d <= 0)) return;
        durationsRef.current = durations;

        // Give the server-clock prefetch a moment; fall back to the local clock.
        for (let i = 0; i < 20 && serverOffsetRef.current === null; i++) {
          await new Promise(r => setTimeout(r, 100));
        }
        if (cancelled || modeRef.current !== 'idle') return;

        const { trackIdx, offsetSec } = getBroadcastPosition(durations, serverOffsetRef.current ?? 0);
        const track = broadcast[trackIdx];

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
        const byteStart = Math.floor(total * (offsetSec / durations[trackIdx]));
        await fetch(track.src, { headers: { Range: `bytes=${byteStart}-${byteStart + 196607}` } });
      } catch { /* warmup is best-effort — the tap path works without it */ }
    })();
    return () => { cancelled = true; };
  }, [broadcast]);

  function getOrCreateAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const a = new Audio();
      a.crossOrigin = 'anonymous';
      // Keep pitch constant if the drift corrector nudges playbackRate — a tempo
      // nudge stays imperceptible, never a pitch shift. (Default is true, but pin it.)
      a.preservesPitch = true;
      a.defaultPlaybackRate = 1;
      a.playbackRate = 1;
      // Defend the broadcast tempo: some media-speed browser extensions force a
      // remembered rate (e.g. 0.9×) onto every <audio>/<video>, which would make the
      // stream play slow. If anything sets a rate we didn't ask for, snap it back.
      a.addEventListener('ratechange', () => {
        if (Math.abs(a.playbackRate - intendedRateRef.current) > 1e-3) {
          a.playbackRate = intendedRateRef.current;
        }
      });
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
    const track = broadcast[idx];
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
      const nextIdx = (broadcastIdxRef.current + 1) % broadcast.length;
      const next = broadcast[nextIdx];
      broadcastIdxRef.current = nextIdx;
      setBroadcastIndex(nextIdx);
      setCurrentTrack(next);
      // #t=0 forces a ranged first request (matches tuneIntoBroadcast) — a plain
      // src assignment sends a full-file GET, which the stream proxy can choke on.
      audio.src = `${next.src}#t=0`;
      audio.play().catch(() => setIsPlaying(false));
    };
  }

  // Seek without overshooting the end (setting currentTime past duration is a no-op on some browsers)
  function safeSeek(audio: HTMLAudioElement, sec: number) {
    audio.currentTime = sec > 0
      ? Math.min(sec, isFinite(audio.duration) ? audio.duration - 1 : sec)
      : 0;
  }

  async function tuneIntoBroadcast() {
    const audio = audioRef.current!;
    intendedRateRef.current = 1;
    audio.playbackRate = 1; // clear any leftover nudge from a previous track

    // All tracks have durationSec hardcoded — resolves instantly, no network requests
    if (!durationsRef.current) {
      durationsRef.current = await Promise.all(broadcast.map(getDuration));
    }

    // Fetch server time once per session to correct for skewed device clocks
    if (serverOffsetRef.current === null) {
      serverOffsetRef.current = await fetchServerOffsetMs();
    }

    const { trackIdx, offsetSec } = getBroadcastPosition(durationsRef.current, serverOffsetRef.current);
    const totalDuration = durationsRef.current.reduce((a, b) => a + b, 0);

    console.log('[VR broadcast]', {
      trackTitle: broadcast[trackIdx].title,
      seek: Math.round(offsetSec),
      totalDuration: Math.round(totalDuration),
      elapsed: Math.round(((Date.now() + serverOffsetRef.current) / 1000) % totalDuration),
      serverOffsetMs: Math.round(serverOffsetRef.current),
    });

    wireBroadcastTrack(trackIdx);

    // Fast path: the mount-time warmup already pointed the element at this
    // track and (on preload-friendly browsers) buffered around the broadcast
    // position. If metadata is in, a direct seek lands in/near that buffer —
    // do NOT reset src, that would discard the primed data.
    const trackHref = new URL(broadcast[trackIdx].src, window.location.href).href;
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
      if (!durationsRef.current || serverOffsetRef.current === null) return;
      const now = getBroadcastPosition(durationsRef.current, serverOffsetRef.current);
      if (now.trackIdx === broadcastIdxRef.current && Math.abs(audio.currentTime - now.offsetSec) > HARD_SEEK_SEC) {
        safeSeek(audio, now.offsetSec);
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

  // Smoothly absorb a small drift by speeding up / slowing down playback a touch.
  // A ±3% rate change is an inaudible pitch shift; it converges over RATE_WINDOW_SEC
  // then snaps back to 1.0. No seek, no glitch.
  function nudgeRate(driftSec: number) {
    const audio = audioRef.current;
    if (!audio) return;
    let rate = 1 + driftSec / RATE_WINDOW_SEC;            // behind → >1, ahead → <1
    rate = Math.max(1 - RATE_MAX, Math.min(1 + RATE_MAX, rate));
    intendedRateRef.current = rate;                       // tell the guard this rate is ours
    audio.playbackRate = rate;
    if (rateResetRef.current) clearTimeout(rateResetRef.current);
    rateResetRef.current = setTimeout(() => {
      intendedRateRef.current = 1;
      if (audioRef.current) audioRef.current.playbackRate = 1;
    }, RATE_WINDOW_SEC * 1000);
  }

  // Periodic check: how far is actual playback from where the broadcast clock says
  // it should be? Small drift → smooth rate nudge. Large drift or wrong track →
  // fade-covered seek/re-tune (rare; mainly after a long stall).
  function correctDrift() {
    if (modeRef.current !== 'broadcast') return;
    const audio = audioRef.current;
    const durations = durationsRef.current;
    if (!audio || audio.paused || !durations || serverOffsetRef.current === null) return;

    const expected = getBroadcastPosition(durations, serverOffsetRef.current);

    // On the wrong track entirely — re-derive from the clock, hidden behind a gain dip
    if (expected.trackIdx !== broadcastIdxRef.current) {
      intendedRateRef.current = 1;
      audio.playbackRate = 1;
      fadeOutThen(() => { tuneIntoBroadcast(); fadeIn(); });
      console.log('[VR broadcast] resync: wrong track → re-tune');
      return;
    }

    const drift = expected.offsetSec - audio.currentTime; // +behind / -ahead
    const absDrift = Math.abs(drift);

    if (absDrift > HARD_SEEK_SEC) {
      intendedRateRef.current = 1;
      audio.playbackRate = 1;
      fadeOutThen(() => { safeSeek(audio, expected.offsetSec); fadeIn(); });
      console.log('[VR broadcast] resync: hard seek', { drift: +drift.toFixed(2) });
    } else if (absDrift > NUDGE_THRESHOLD_SEC) {
      nudgeRate(drift);
      console.log('[VR broadcast] resync: rate nudge', { drift: +drift.toFixed(2), rate: +audio.playbackRate.toFixed(3) });
    }
  }

  function startBroadcastTimers() {
    stopBroadcastTimers();
    correctTimerRef.current = setInterval(correctDrift, CORRECT_INTERVAL_MS);
    timeRefreshRef.current  = setInterval(async () => {
      try { serverOffsetRef.current = await fetchServerOffsetMs(); } catch { /* keep last offset */ }
    }, TIME_REFRESH_MS);
  }

  function stopBroadcastTimers() {
    if (correctTimerRef.current) { clearInterval(correctTimerRef.current); correctTimerRef.current = null; }
    if (timeRefreshRef.current)  { clearInterval(timeRefreshRef.current);  timeRefreshRef.current  = null; }
    if (rateResetRef.current)    { clearTimeout(rateResetRef.current);     rateResetRef.current    = null; }
    intendedRateRef.current = 1;
    if (audioRef.current) audioRef.current.playbackRate = 1;
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
    tuneIntoBroadcast();
    startBroadcastTimers();
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
