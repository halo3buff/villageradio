# Send Transmission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/transmit` page where visitors record short audio messages (up to 3 min) on an oscilloscope-styled recorder, review them, and "transmit" them to Vercel Blob for private archival.

**Architecture:** A self-contained `useRecorder` React hook wraps `MediaRecorder` + `AnalyserNode` and exposes a clean state machine. A presentational `<Oscilloscope />` component handles the visual + interaction layer, mirroring `LissajousScope.tsx`'s panel language but with a horizontal-sweep time-domain canvas. A single Next.js Route Handler (`POST /api/transmissions`) validates the upload and stores it in Vercel Blob. Homepage gets one new entry-point link above the infrared image; top nav is untouched.

**Tech Stack:** Next.js 15 App Router, TypeScript (strict), `MediaRecorder` Web API, Web Audio `AnalyserNode`, `@vercel/blob`.

**Note on testing:** This project has no unit-test framework set up (per spec, adding one is out of scope). Verification for every task is via `npx tsc --noEmit`, `npm run lint`, and manual browser checks against the running dev server at `localhost:3000`.

**Reference spec:** `docs/superpowers/specs/2026-05-17-send-transmission-design.md`

---

## Task 1: Add the Vercel Blob dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

Run:
```bash
npm install @vercel/blob
```

Expected: `package.json` now lists `"@vercel/blob"` under `dependencies`; `package-lock.json` updated.

- [ ] **Step 2: Verify typecheck still passes**

Run:
```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "add: @vercel/blob dependency for transmission storage"
```

---

## Task 2: Create the `useRecorder` hook

**Files:**
- Create: `src/lib/use-recorder.ts`

- [ ] **Step 1: Write the hook**

Create `src/lib/use-recorder.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'armed' | 'recording' | 'review' | 'error';

export interface RecorderApi {
  state: RecorderState;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  blob: Blob | null;
  duration: number;
  peakLevel: number;
  analyser: AnalyserNode | null;
  error: string | null;
}

const MAX_DURATION_SECONDS = 180;
const PREFERRED_MIME = 'audio/webm; codecs=opus';
const FALLBACK_MIME = 'audio/webm';

export function useRecorder(): RecorderApi {
  const [state, setState] = useState<RecorderState>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* ignore */ }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* ignore */ }
      analyserRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { /* ignore */ });
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setAnalyser(null);
  }, []);

  const tickLevel = useCallback(() => {
    const a = analyserRef.current;
    if (!a) return;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i]);
      if (v > peak) peak = v;
    }
    setPeakLevel(peak);
    setDuration((performance.now() - startedAtRef.current) / 1000);
    rafRef.current = requestAnimationFrame(tickLevel);
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setBlob(null);
    setDuration(0);
    setPeakLevel(0);

    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      setError('This browser does not support audio recording.');
      setState('error');
      return;
    }

    try {
      setState('armed');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0.6;
      source.connect(a);
      sourceRef.current = source;
      analyserRef.current = a;
      setAnalyser(a);

      const mimeType = MediaRecorder.isTypeSupported(PREFERRED_MIME)
        ? PREFERRED_MIME
        : MediaRecorder.isTypeSupported(FALLBACK_MIME)
        ? FALLBACK_MIME
        : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        if (stopTimeoutRef.current) {
          clearTimeout(stopTimeoutRef.current);
          stopTimeoutRef.current = null;
        }
        const finalBlob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
        setBlob(finalBlob);
        setDuration((performance.now() - startedAtRef.current) / 1000);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        setState('review');
      };

      startedAtRef.current = performance.now();
      recorder.start(250);
      setState('recording');
      rafRef.current = requestAnimationFrame(tickLevel);

      stopTimeoutRef.current = setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          recorderRef.current.stop();
        }
      }, MAX_DURATION_SECONDS * 1000);
    } catch (err) {
      const msg = err instanceof Error && err.name === 'NotAllowedError'
        ? 'Microphone access denied — enable it in your browser settings.'
        : 'Could not start recording.';
      setError(msg);
      setState('error');
      cleanup();
    }
  }, [cleanup, tickLevel]);

  const reset = useCallback(() => {
    cleanup();
    setBlob(null);
    setDuration(0);
    setPeakLevel(0);
    setError(null);
    setState('idle');
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { state, start, stop, reset, blob, duration, peakLevel, analyser, error };
}
```

- [ ] **Step 2: Verify typecheck passes**

Run:
```bash
npx tsc --noEmit
```

Expected: no output (clean). If errors, fix before continuing.

- [ ] **Step 3: Verify lint passes**

Run:
```bash
npm run lint
```

Expected: no errors specific to `src/lib/use-recorder.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/use-recorder.ts
git commit -m "add: useRecorder hook wrapping MediaRecorder + analyser"
```

---

## Task 3: Create the API route for receiving transmissions

**Files:**
- Create: `src/app/api/transmissions/route.ts`

- [ ] **Step 1: Write the route handler**

Create `src/app/api/transmissions/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

const MAX_BYTES = 5_242_880; // 5 MB

function sanitizeHandle(raw: string | null): string {
  if (!raw) return 'anon';
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_\-.]/g, '').slice(0, 64);
  return cleaned.length === 0 ? 'anon' : cleaned;
}

function isoTimestampForKey(): string {
  // 2026-05-17T22-14-03Z — filesystem-safe
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function POST(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const audio = form.get('audio');
  const handleRaw = form.get('handle');

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'missing_audio' }, { status: 400 });
  }
  if (!audio.type.startsWith('audio/')) {
    return NextResponse.json({ ok: false, error: 'invalid_audio_type' }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ ok: false, error: 'empty_audio' }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'audio_too_large' }, { status: 400 });
  }

  const handle = sanitizeHandle(typeof handleRaw === 'string' ? handleRaw : null);
  const key = `transmissions/${isoTimestampForKey()}-${handle}-${randomSuffix()}.webm`;

  try {
    await put(key, audio, {
      access: 'public',
      addRandomSuffix: false,
      contentType: audio.type,
    });
  } catch (err) {
    console.error('[transmissions] upload failed', err);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify typecheck passes**

Run:
```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Verify lint passes**

Run:
```bash
npm run lint
```

Expected: no errors specific to the new file.

- [ ] **Step 4: Manually sanity-check the endpoint exists**

With the dev server running, in a separate terminal:
```bash
curl -i -X POST http://localhost:3000/api/transmissions
```

Expected: `HTTP/1.1 400` with body `{"ok":false,"error":"missing_audio"}`. (No audio attached, so the validation should fire — this confirms the route is reachable and validation works without needing the Blob token.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/transmissions/route.ts
git commit -m "add: POST /api/transmissions route uploading to Vercel Blob"
```

---

## Task 4: Build the Oscilloscope component (state machine + readouts + buttons, canvas as placeholder)

**Files:**
- Create: `src/components/Oscilloscope.tsx`

This task builds the full UI shell with working state transitions. The canvas is wired up but only renders the grid — the live waveform and playback drawing land in Tasks 6 and 7.

- [ ] **Step 1: Write the component**

Create `src/components/Oscilloscope.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRecorder } from '@/lib/use-recorder';

const VR_FONT = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const MAX_HANDLE = 64;
const MAX_DURATION = 180;

type PageState = 'transmitting' | 'sent' | null;

function fmtDuration(s: number): string {
  const total = Math.max(0, Math.floor(s));
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
}

function levelBar(level: number): string {
  const cells = 10;
  const filled = Math.min(cells, Math.round(level * cells * 1.5));
  return '▮'.repeat(filled) + '▯'.repeat(cells - filled);
}

function levelDb(level: number): string {
  if (level <= 0.0001) return '-∞ dB';
  const db = 20 * Math.log10(level);
  return `${db.toFixed(0).padStart(3, ' ')} dB`;
}

export function Oscilloscope() {
  const rec = useRecorder();
  const [handle, setHandle] = useState('');
  const [pageState, setPageState] = useState<PageState>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Playback wiring — Audio element fed by the recorded blob
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playPos, setPlayPos] = useState(0);

  useEffect(() => {
    if (!rec.blob) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setPlaying(false);
      setPlayPos(0);
      return;
    }
    const url = URL.createObjectURL(rec.blob);
    const el = new Audio(url);
    el.preload = 'auto';
    audioRef.current = el;
    const onTime = () => setPlayPos(el.currentTime);
    const onEnd = () => { setPlaying(false); setPlayPos(0); };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
      el.pause();
      URL.revokeObjectURL(url);
    };
  }, [rec.blob]);

  const togglePlayback = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => { /* ignore */ });
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  // Canvas — placeholder grid for now; drawing happens in later tasks
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    const container = containerRef.current;
    if (!c || !container) return;
    const ro = new ResizeObserver(() => {
      const w = Math.floor(container.clientWidth);
      const h = Math.floor(container.clientHeight);
      if (w <= 0 || h <= 0) return;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, w, h);
      // grid
      ctx.strokeStyle = 'rgba(0, 200, 60, 0.07)';
      ctx.lineWidth = 1;
      const cols = 12, rows = 4;
      for (let i = 0; i <= cols; i++) { ctx.beginPath(); ctx.moveTo(i * w / cols, 0); ctx.lineTo(i * w / cols, h); ctx.stroke(); }
      for (let j = 0; j <= rows; j++) { ctx.beginPath(); ctx.moveTo(0, j * h / rows); ctx.lineTo(w, j * h / rows); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(0, 200, 60, 0.12)';
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Send logic
  const send = useCallback(async () => {
    if (!rec.blob) return;
    setSendError(null);
    setPageState('transmitting');
    try {
      const form = new FormData();
      form.append('audio', rec.blob, 'transmission.webm');
      form.append('handle', handle);
      const res = await fetch('/api/transmissions', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({ ok: false, error: 'bad_response' }));
      if (!res.ok || !json.ok) {
        setSendError(json.error || 'send_failed');
        setPageState(null);
        return;
      }
      setPageState('sent');
    } catch {
      setSendError('network_failed');
      setPageState(null);
    }
  }, [handle, rec.blob]);

  const sendAnother = useCallback(() => {
    setPageState(null);
    setSendError(null);
    setHandle('');
    rec.reset();
  }, [rec]);

  const status = (() => {
    if (pageState === 'transmitting') return 'TRANSMITTING';
    if (pageState === 'sent') return 'RECEIVED';
    switch (rec.state) {
      case 'idle': return 'IDLE';
      case 'armed': return 'ARMED';
      case 'recording': return 'RECORDING';
      case 'review': return 'REVIEW';
      case 'error': return 'ERROR';
    }
  })();

  const isLive = rec.state === 'recording';
  const isReview = rec.state === 'review' && pageState === null;
  const transmitting = pageState === 'transmitting';
  const sent = pageState === 'sent';

  const readout: [string, string][] = [
    ['MODE', 'AUDIO RECORDER'],
    ['FORMAT', 'WEBM / OPUS'],
    ['BITRATE', '64 KBPS'],
    ['DURATION', `${fmtDuration(rec.duration)} / ${fmtDuration(MAX_DURATION)}`],
    ['LEVEL', `${levelBar(rec.peakLevel)}  ${levelDb(rec.peakLevel)}`],
    ['STATUS', status],
  ];

  return (
    <div style={{ fontFamily: VR_FONT, display: 'block', width: '100%', maxWidth: 720 }}>
      <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: 'rgba(0,200,60,0.5)', marginBottom: '6px' }}>
        TRANSMISSION INPUT  CH-A
      </div>

      <div
        style={{
          border: '1px solid rgba(0,200,60,0.2)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,0,0,0.5), 0 0 30px rgba(0,180,60,0.05)',
          background: '#050505',
          position: 'relative',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', aspectRatio: '3 / 1', lineHeight: 0, position: 'relative' }}>
          <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.10) 1px, rgba(0,0,0,0.10) 2px)', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />
      </div>

      <div style={{ padding: '6px 0', fontSize: '9px', letterSpacing: '0.15em', lineHeight: '1.5' }}>
        {readout.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: '12px' }}>
            <span style={{ color: '#6b5f3a', minWidth: '68px' }}>{label}</span>
            <span style={{
              color: status === 'RECORDING' && label === 'STATUS' ? '#ff5050'
                : status === 'RECEIVED' && label === 'STATUS' ? '#4a9e4a'
                : '#e8e4d9',
            }}>{value}</span>
          </div>
        ))}
        {rec.error && (
          <div style={{ marginTop: 6, color: '#ff5050' }}>{rec.error}</div>
        )}
        {sendError && (
          <div style={{ marginTop: 6, color: '#ff5050' }}>TRANSMISSION FAILED — {sendError.toUpperCase()}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 9, letterSpacing: '0.15em', alignItems: 'center', margin: '6px 0' }}>
        <span style={{ color: '#6b5f3a', minWidth: 68 }}>HANDLE</span>
        <input
          type="text"
          value={handle}
          maxLength={MAX_HANDLE}
          disabled={!isReview}
          onChange={(e) => setHandle(e.target.value)}
          placeholder={isReview ? 'optional' : ''}
          style={{
            fontFamily: 'inherit',
            fontSize: 9,
            letterSpacing: '0.15em',
            color: '#e8e4d9',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid rgba(255,255,255,0.15)',
            padding: '2px 0',
            flex: 1,
            outline: 'none',
            opacity: isReview ? 1 : 0.4,
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <Buttons
          recState={rec.state}
          transmitting={transmitting}
          sent={sent}
          playing={playing}
          onArm={() => { rec.reset(); rec.start(); }}
          onStop={rec.stop}
          onPlayback={togglePlayback}
          onReRecord={() => { rec.reset(); }}
          onTransmit={send}
          onSendAnother={sendAnother}
          onRetry={() => { rec.reset(); rec.start(); }}
        />
      </div>

      {/* Hidden ref target; canvas-driven playhead in later task uses playPos */}
      <span hidden>{playPos.toFixed(2)}</span>
    </div>
  );
}

interface ButtonsProps {
  recState: ReturnType<typeof useRecorder>['state'];
  transmitting: boolean;
  sent: boolean;
  playing: boolean;
  onArm: () => void;
  onStop: () => void;
  onPlayback: () => void;
  onReRecord: () => void;
  onTransmit: () => void;
  onSendAnother: () => void;
  onRetry: () => void;
}

function ScopeButton({
  onClick,
  children,
  active,
  disabled,
  red,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  red?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const color = disabled
    ? 'rgba(232,228,217,0.25)'
    : active || hover
    ? '#e8e4d9'
    : 'rgba(232,228,217,0.45)';
  const border = disabled
    ? 'rgba(255,255,255,0.06)'
    : red
    ? 'rgba(255,80,80,0.35)'
    : active
    ? 'rgba(0,255,80,0.25)'
    : hover
    ? 'rgba(255,255,255,0.28)'
    : 'rgba(255,255,255,0.10)';
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={disabled}
      style={{
        fontFamily: 'inherit',
        fontSize: 9,
        letterSpacing: '0.15em',
        color,
        background: 'none',
        border: `1px solid ${border}`,
        boxShadow: active && !red ? '0 0 8px rgba(0,255,80,0.2)' : red && active ? '0 0 8px rgba(255,80,80,0.25)' : 'none',
        padding: '4px 12px',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}

function Buttons(p: ButtonsProps) {
  if (p.sent) {
    return (
      <>
        <ScopeButton onClick={() => {}} active disabled>[ RECEIVED ✓ ]</ScopeButton>
        <ScopeButton onClick={p.onSendAnother}>[ SEND ANOTHER ]</ScopeButton>
      </>
    );
  }
  if (p.transmitting) {
    return <ScopeButton onClick={() => {}} disabled>[ TRANSMITTING... ]</ScopeButton>;
  }
  if (p.recState === 'error') {
    return <ScopeButton onClick={p.onRetry}>[ RETRY ]</ScopeButton>;
  }
  if (p.recState === 'idle') {
    return <ScopeButton onClick={p.onArm}>[ ARM ]</ScopeButton>;
  }
  if (p.recState === 'armed') {
    return <ScopeButton onClick={() => {}} disabled>[ ACQUIRING... ]</ScopeButton>;
  }
  if (p.recState === 'recording') {
    return <ScopeButton onClick={p.onStop} active red>[ ■ STOP ]</ScopeButton>;
  }
  // review
  return (
    <>
      <ScopeButton onClick={p.onPlayback}>{p.playing ? '[ ❚❚ PAUSE ]' : '[ ▶ PLAYBACK ]'}</ScopeButton>
      <ScopeButton onClick={p.onReRecord}>[ RE-RECORD ]</ScopeButton>
      <ScopeButton onClick={p.onTransmit}>[ TRANSMIT → ]</ScopeButton>
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run:
```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Verify lint passes**

Run:
```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/Oscilloscope.tsx
git commit -m "add: Oscilloscope component with state machine and readouts"
```

---

## Task 5: Create the `/transmit` page

**Files:**
- Create: `src/app/transmit/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/transmit/page.tsx`:

```tsx
import { Oscilloscope } from '@/components/Oscilloscope';

export const metadata = {
  title: 'Transmit',
  description: 'Send a transmission to Village Radio.',
};

export default function TransmitPage() {
  return (
    <div className="px-4 sm:px-5 pt-2 sm:pt-3 page-enter">
      <div className="mb-3 sm:mb-4 text-xs tracking-[0.15em] text-[rgba(200,196,187,0.7)]">
        SEND TRANSMISSION
      </div>
      <Oscilloscope />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run:
```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Manual browser check — full flow with placeholder waveform**

With `npm run dev` running, visit `http://localhost:3000/transmit`. Verify:
- Page renders with nav at top, audio player at bottom, oscilloscope panel visible
- `STATUS` reads `IDLE`, `[ ARM ]` button visible, handle field disabled
- Click `[ ARM ]` → browser prompts for mic permission → grant → button changes to `[ ■ STOP ]` (status `RECORDING`, timer counts up, LEVEL bar reacts to your voice)
- Click `[ ■ STOP ]` → status flips to `REVIEW`, three buttons appear (`PLAYBACK`, `RE-RECORD`, `TRANSMIT`), handle field becomes enabled
- Click `[ ▶ PLAYBACK ]` → you hear what you just recorded; button toggles to `[ ❚❚ PAUSE ]`
- Click `[ RE-RECORD ]` → back to `IDLE`
- Deny mic permission on a fresh load → status `ERROR`, red error text visible, `[ RETRY ]` button shown

If any of the above fails, fix before committing.

- [ ] **Step 4: Commit**

```bash
git add src/app/transmit/page.tsx
git commit -m "add: /transmit page wiring Oscilloscope into the app"
```

---

## Task 6: Implement the live recording waveform sweep

**Files:**
- Modify: `src/components/Oscilloscope.tsx`

Replace the placeholder canvas effect with a left-to-right sweep driven by the analyser node during `recording`.

- [ ] **Step 1: Replace the canvas effect**

In `src/components/Oscilloscope.tsx`, locate the `useEffect` containing the `ResizeObserver` that sets up the placeholder grid (it sets `c.width`, `c.height` and draws static lines). Replace **that entire `useEffect` block** (and remove the `containerRef` from where it was previously used only for resize observation) with the following block. Keep the `canvasRef` and `containerRef` declarations as-is.

Add these refs alongside the existing refs near the top of the component:

```tsx
const rafDrawRef = useRef<number>(0);
const sweepXRef = useRef<number>(0);
```

Then replace the placeholder `useEffect` with:

```tsx
useEffect(() => {
  const c = canvasRef.current;
  const container = containerRef.current;
  if (!c || !container) return;

  const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0, 200, 60, 0.07)';
    ctx.lineWidth = 1;
    const cols = 12, rows = 4;
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath();
      ctx.moveTo((i * w) / cols, 0);
      ctx.lineTo((i * w) / cols, h);
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      ctx.beginPath();
      ctx.moveTo(0, (j * h) / rows);
      ctx.lineTo(w, (j * h) / rows);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0, 200, 60, 0.12)';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  };

  const resize = () => {
    const w = Math.floor(container.clientWidth);
    const h = Math.floor(container.clientHeight);
    if (w <= 0 || h <= 0) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    drawGrid(ctx, w, h);
    sweepXRef.current = 0;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const draw = () => {
    const ctx = c.getContext('2d');
    if (!ctx) {
      rafDrawRef.current = requestAnimationFrame(draw);
      return;
    }
    const w = c.width;
    const h = c.height;

    // Phosphor decay
    ctx.fillStyle = 'rgba(8, 8, 8, 0.18)';
    ctx.fillRect(0, 0, w, h);

    const a = rec.analyser;
    if (a && rec.state === 'recording') {
      const buf = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(buf);
      // Average a chunk of samples into one screen column for this frame
      let sum = 0;
      let peak = 0;
      const sampleCount = Math.min(buf.length, 512);
      for (let i = 0; i < sampleCount; i++) {
        const v = buf[i];
        sum += v * v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      const rms = Math.sqrt(sum / sampleCount);
      const amp = Math.max(rms, peak * 0.5);
      const cy = h / 2;
      const x = sweepXRef.current;

      // Erase the column we're about to draw (clean head)
      ctx.fillStyle = '#050505';
      ctx.fillRect(x, 0, 2, h);

      // Redraw grid lines that crossed this column
      ctx.strokeStyle = 'rgba(0, 200, 60, 0.12)';
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + 2, cy);
      ctx.stroke();

      // Draw the sample vertical line
      ctx.strokeStyle = 'rgba(0, 255, 80, 0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, cy - amp * (h / 2) * 0.95);
      ctx.lineTo(x + 0.5, cy + amp * (h / 2) * 0.95);
      ctx.stroke();

      // Bright leading edge (sweep cursor)
      ctx.fillStyle = 'rgba(0, 255, 80, 0.9)';
      ctx.fillRect(x + 1, 0, 1, h);

      sweepXRef.current = (x + 1) % w;
    }

    rafDrawRef.current = requestAnimationFrame(draw);
  };
  rafDrawRef.current = requestAnimationFrame(draw);

  return () => {
    ro.disconnect();
    if (rafDrawRef.current) cancelAnimationFrame(rafDrawRef.current);
  };
}, [rec.analyser, rec.state]);
```

- [ ] **Step 2: Verify typecheck passes**

Run:
```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Manual browser check — live waveform**

Refresh `http://localhost:3000/transmit`. Click `[ ARM ]`, grant mic, speak. Verify:
- A green waveform sweeps left-to-right across the scope as you speak
- Louder sounds = taller waveform peaks
- When silent, the line stays near the center axis
- The sweep wraps back to the left edge once it reaches the right
- During `IDLE` / `REVIEW` / `ERROR`, no sweep is drawn — the canvas just shows the static grid

- [ ] **Step 4: Commit**

```bash
git add src/components/Oscilloscope.tsx
git commit -m "add: live sweep rendering during recording on oscilloscope"
```

---

## Task 7: Implement the review-mode waveform with playhead

**Files:**
- Modify: `src/components/Oscilloscope.tsx`

When recording stops, decode the blob to an `AudioBuffer`, downsample to one peak per canvas column, draw it as a static waveform, then animate a vertical playhead as the user plays back.

- [ ] **Step 1: Add the waveform precomputation effect**

Add the following near the other state declarations in the component (just after `playPos` state):

```tsx
const [reviewPeaks, setReviewPeaks] = useState<Float32Array | null>(null);
const [reviewDuration, setReviewDuration] = useState(0);
```

Add this `useEffect` immediately after the existing playback wiring `useEffect` (the one that builds the `Audio` element from `rec.blob`):

```tsx
useEffect(() => {
  if (!rec.blob) {
    setReviewPeaks(null);
    setReviewDuration(0);
    return;
  }
  let cancelled = false;
  (async () => {
    try {
      const arr = await rec.blob!.arrayBuffer();
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const decoded = await ctx.decodeAudioData(arr.slice(0));
      await ctx.close();
      if (cancelled) return;

      const COLS = 600;
      const ch = decoded.getChannelData(0);
      const stride = Math.max(1, Math.floor(ch.length / COLS));
      const peaks = new Float32Array(COLS);
      for (let i = 0; i < COLS; i++) {
        let max = 0;
        const start = i * stride;
        const end = Math.min(ch.length, start + stride);
        for (let j = start; j < end; j++) {
          const v = Math.abs(ch[j]);
          if (v > max) max = v;
        }
        peaks[i] = max;
      }
      setReviewPeaks(peaks);
      setReviewDuration(decoded.duration);
    } catch {
      // If decode fails, leave peaks null — the canvas will just show the grid
    }
  })();
  return () => { cancelled = true; };
}, [rec.blob]);
```

- [ ] **Step 2: Extend the draw loop to handle review mode**

In the canvas `useEffect` from Task 6, find the `draw` function. Below the `if (a && rec.state === 'recording')` block but **before** the `rafDrawRef.current = requestAnimationFrame(draw);` line at the end of `draw`, add this branch:

```tsx
    if (rec.state === 'review' && reviewPeaks) {
      // Fully repaint the static waveform each frame so the playhead is the only moving part
      const ctx2 = c.getContext('2d');
      if (!ctx2) return;
      ctx2.fillStyle = '#050505';
      ctx2.fillRect(0, 0, w, h);
      // grid
      ctx2.strokeStyle = 'rgba(0, 200, 60, 0.07)';
      ctx2.lineWidth = 1;
      const cols = 12, rows = 4;
      for (let i = 0; i <= cols; i++) { ctx2.beginPath(); ctx2.moveTo((i * w) / cols, 0); ctx2.lineTo((i * w) / cols, h); ctx2.stroke(); }
      for (let j = 0; j <= rows; j++) { ctx2.beginPath(); ctx2.moveTo(0, (j * h) / rows); ctx2.lineTo(w, (j * h) / rows); ctx2.stroke(); }
      ctx2.strokeStyle = 'rgba(0, 200, 60, 0.12)';
      ctx2.beginPath(); ctx2.moveTo(0, h / 2); ctx2.lineTo(w, h / 2); ctx2.stroke();

      // waveform
      ctx2.strokeStyle = 'rgba(0, 255, 80, 0.7)';
      ctx2.lineWidth = 1;
      const cy = h / 2;
      for (let i = 0; i < reviewPeaks.length; i++) {
        const x = (i / reviewPeaks.length) * w;
        const amp = reviewPeaks[i] * (h / 2) * 0.95;
        ctx2.beginPath();
        ctx2.moveTo(x, cy - amp);
        ctx2.lineTo(x, cy + amp);
        ctx2.stroke();
      }

      // playhead
      if (reviewDuration > 0) {
        const px = (playPos / reviewDuration) * w;
        ctx2.fillStyle = 'rgba(0, 255, 80, 0.9)';
        ctx2.fillRect(px, 0, 1, h);
      }
    }
```

Now also extend the dependency array of the canvas `useEffect` to include the new fields. Change the existing closing line from:

```tsx
}, [rec.analyser, rec.state]);
```

to:

```tsx
}, [rec.analyser, rec.state, reviewPeaks, reviewDuration, playPos]);
```

- [ ] **Step 3: Remove the now-unused hidden span**

In the JSX, delete the line:

```tsx
<span hidden>{playPos.toFixed(2)}</span>
```

`playPos` is now consumed inside the draw loop via the dependency array, so the span isn't needed anymore.

- [ ] **Step 4: Verify typecheck passes**

Run:
```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Manual browser check — review waveform + playhead**

Refresh `/transmit`. Record ~5 seconds of audio. Verify:
- After clicking STOP, the scope shows the entire recorded waveform as static green vertical lines across the full width
- Clicking PLAYBACK starts playback AND a vertical green line moves left-to-right across the waveform in sync with what you hear
- When playback ends, the playhead returns to the left
- Clicking RE-RECORD clears the waveform and returns to the grid

- [ ] **Step 6: Commit**

```bash
git add src/components/Oscilloscope.tsx
git commit -m "add: review waveform with playhead on oscilloscope"
```

---

## Task 8: Add the homepage entry link

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add the link above the infrared image**

Open `src/app/page.tsx`. Locate the right-column `div` containing the infrared `Image` (the one with `className="relative aspect-square ..."`). Wrap that div in a flex column so we can stack the link above it.

Replace this block:

```tsx
        {/* Thermal photograph — secondary, smaller, offset right */}
        <div className="relative aspect-square w-full max-w-[260px] md:max-w-[200px] md:self-end md:ml-auto shrink-0">
          <Image
            src="/images/photography/infrared/Home_page_1.PNG"
            alt=""
            fill
            className="object-cover"
            priority
            sizes="(max-width: 768px) 260px, 200px"
          />
        </div>
```

with:

```tsx
        {/* Right column: transmit link + thermal photograph */}
        <div className="flex flex-col gap-2 w-full max-w-[260px] md:max-w-[200px] md:self-end md:ml-auto shrink-0">
          <Link
            href="/transmit"
            className="block text-right text-xs tracking-[0.15em] uppercase text-[rgba(200,196,187,0.7)] hover:text-[#e8e4d9] transition-colors duration-150"
          >
            ► send transmission
          </Link>
          <div className="relative aspect-square w-full">
            <Image
              src="/images/photography/infrared/Home_page_1.PNG"
              alt=""
              fill
              className="object-cover"
              priority
              sizes="(max-width: 768px) 260px, 200px"
            />
          </div>
        </div>
```

(`Link` is already imported at the top of the file.)

- [ ] **Step 2: Verify typecheck passes**

Run:
```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Manual browser check — homepage link**

Visit `http://localhost:3000/`. Verify:
- `► SEND TRANSMISSION` link appears, right-aligned, in mono uppercase, above the infrared image
- Link hover lightens it to `#e8e4d9`
- Clicking it navigates to `/transmit`
- Homepage still fits on screen without scrolling
- The Lissajous scope on the left and the infrared image on the right are still aligned the same way

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "add: send transmission link on homepage above infrared image"
```

---

## Task 9: End-to-end verification

**Files:** none

- [ ] **Step 1: Run all checks**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all pass. The `build` confirms the API route handler compiles correctly for production (catches issues that dev mode hides).

- [ ] **Step 2: Manual regression**

With the dev server running, click through:

- `/` — homepage fits, Lissajous works, broadcast button works, transmit link visible
- `/mixes` — loads without errors
- `/work` — loads without errors
- `/photography` — loads without errors
- `/listen` — loads without errors (SDR waterfall still functional)
- `/about` (or `/information`) — loads without errors
- `/transmit` — full record/review/re-record cycle works as in Task 5/7 checks

- [ ] **Step 3: Manual end-to-end transmit (optional, requires Blob token)**

To test the actual upload end-to-end locally:

1. Get a Vercel Blob read/write token from the Vercel dashboard (Project → Storage → your Blob store → `.env.local` snippet)
2. Add it to `.env.local` at the project root:
   ```
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxxxxxxxx
   ```
3. Restart `npm run dev` (env-var changes need a restart)
4. Record a transmission, click TRANSMIT → expect `RECEIVED ✓`
5. Verify the file appears in the Vercel dashboard under `transmissions/...webm`

If you don't have a token yet, skip this step — the upload will fail in dev with a clear error message, which is fine. The production deploy auto-injects the token.

- [ ] **Step 4: No commit needed unless something was fixed during verification**

If you fixed anything, commit it with a descriptive message. Otherwise the branch is ready to push and PR.

---

## Summary of files touched

- **Added:**
  - `src/lib/use-recorder.ts`
  - `src/components/Oscilloscope.tsx`
  - `src/app/transmit/page.tsx`
  - `src/app/api/transmissions/route.ts`
  - `docs/superpowers/specs/2026-05-17-send-transmission-design.md` (already committed in prior session)
  - `docs/superpowers/plans/2026-05-17-send-transmission.md` (this file)
- **Modified:**
  - `src/app/page.tsx` (homepage link)
  - `package.json`, `package-lock.json` (`@vercel/blob` dependency)
- **Unchanged (deliberately):**
  - `src/components/Nav.tsx` — `/transmit` is homepage-only, not in top nav
