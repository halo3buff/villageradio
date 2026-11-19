'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRecorder } from '@/lib/use-recorder';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const MID = '#897a5f';   // the device's ink: its negative is a light blue, #7685a0 (globals.css)
const MAX_HANDLE = 64;
const MAX_DURATION = 180;

// The station's scope drawing (HomeDesktop), in a taller window that spans the device.
const SH = 112, REACH = 50;
// the station plate's width (HomeDesktop): the device ends where it does
const PLATE_W = 340;
const DOT = 3, STEP = 8;
// Recording is mono, so the figure is the voice against itself a few ms back —
// the lag opens it into a Lissajous the way L against R does on the station.
const PHASE_LAG = 160;
// quiet voices lifted so the figure still moves, exactly the station's numbers
const FLOOR_DB = -30, LIFT_MAX_DB = 40, LIFT_EASE_S = 0.5;

type PageState = 'transmitting' | 'sent' | null;

function fmtDuration(s: number): string {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`;
}
function levelBar(level: number): string {
  const cells = 8;
  const filled = Math.min(cells, Math.round(level * cells * 1.5));
  return '|'.repeat(filled) + '·'.repeat(cells - filled);
}
function levelDb(level: number): string {
  if (level <= 0.0001) return '-∞ dB';
  return `${(20 * Math.log10(level)).toFixed(0).padStart(3, ' ')} dB`;
}

export function Oscilloscope() {
  const rec = useRecorder();
  const [handle, setHandle] = useState('');
  const [pageState, setPageState] = useState<PageState>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [reviewPeaks, setReviewPeaks] = useState<Float32Array | null>(null);
  const [reviewDuration, setReviewDuration] = useState(0);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playPosRef = useRef(0);

  useEffect(() => {
    if (!rec.blob) {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.src = '';
      setPlaying(false); setLoop(false);
      playPosRef.current = 0;
      if (playbackCtxRef.current) { playbackCtxRef.current.close().catch(() => {}); playbackCtxRef.current = null; }
      return;
    }
    const url = URL.createObjectURL(rec.blob);
    const el = new Audio(url);
    el.preload = 'auto';
    audioRef.current = el;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    playbackCtxRef.current = ctx;
    const src = ctx.createMediaElementSource(el);
    src.connect(ctx.destination);
    const onTime = () => { playPosRef.current = el.currentTime; };
    const onEnd = () => { setPlaying(false); playPosRef.current = 0; };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
      el.pause(); URL.revokeObjectURL(url);
      if (playbackCtxRef.current) { playbackCtxRef.current.close().catch(() => {}); playbackCtxRef.current = null; }
    };
  }, [rec.blob]);

  useEffect(() => { if (audioRef.current) audioRef.current.loop = loop; }, [loop]);

  useEffect(() => {
    if (!rec.blob) { setReviewPeaks(null); setReviewDuration(0); return; }
    let cancelled = false;
    (async () => {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      try {
        const arr = await rec.blob!.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr.slice(0));
        if (cancelled) return;
        const COLS = 600;
        const ch = decoded.getChannelData(0);
        const stride = Math.max(1, Math.floor(ch.length / COLS));
        const peaks = new Float32Array(COLS);
        for (let i = 0; i < COLS; i++) {
          let max = 0;
          for (let j = i * stride; j < Math.min(ch.length, (i + 1) * stride); j++) {
            const v = Math.abs(ch[j]); if (v > max) max = v;
          }
          peaks[i] = max;
        }
        setReviewPeaks(peaks); setReviewDuration(decoded.duration);
      } catch { /* leave peaks null */ } finally { ctx.close().catch(() => {}); }
    })();
    return () => { cancelled = true; };
  }, [rec.blob]);

  const togglePlayback = useCallback(() => {
    const el = audioRef.current; if (!el) return;
    const ctx = playbackCtxRef.current;
    if (el.paused) {
      if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
      el.play().then(() => setPlaying(true)).catch(() => {});
    } else { el.pause(); setPlaying(false); }
  }, []);

  // Canvas — the station's window: glowing dots on the photo, no grid, no black.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => { if (rec.state === 'recording') setSendError(null); }, [rec.state]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // canvas fills its window
    const SW = c.clientWidth || 104;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = SW * dpr; c.height = SH * dpr;
    c.getContext('2d')?.scale(dpr, dpr);

    const ink = getComputedStyle(c).color || '#fff';
    let buf = new Float32Array(2048);
    let lift = 0, last = 0;

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const t = now / 1000, cx = SW / 2, cy = SH / 2, reach = REACH, reachX = SW / 2 - 14;
      ctx.clearRect(0, 0, SW, SH);
      ctx.fillStyle = ink;
      const dotAt = (x: number, y: number) =>
        ctx.fillRect(Math.round(x - DOT / 2), Math.round(y - DOT / 2), DOT, DOT);

      const a = rec.analyser;
      if (a && rec.state === 'recording') {
        if (buf.length !== a.fftSize) buf = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(buf);
        let energy = 0;
        for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
        const level = 10 * Math.log10(energy / buf.length || 1e-12);
        const want = Math.min(LIFT_MAX_DB, Math.max(0, FLOOR_DB - level));
        // drops at once when the voice comes back up, so a hit never overshoots; rises gently
        lift = want < lift ? want : lift + (want - lift) * (1 - Math.exp(-Math.min(0.25, (now - last) / 1000) / LIFT_EASE_S));
        const gain = Math.pow(10, lift / 20);
        const clip = (v: number) => Math.max(-1, Math.min(1, v * gain));
        for (let i = 0; i + PHASE_LAG < buf.length; i += STEP) {
          dotAt(cx + clip(buf[i + PHASE_LAG]) * reachX, cy - clip(buf[i]) * reach);
        }
      } else if (rec.state === 'review' && !pageState && reviewPeaks) {
        // the take, laid out as its envelope in the same dots; a dotted playhead walks it
        const pad = 14, span = SW - 2 * pad;
        for (let i = 0; i < reviewPeaks.length; i += 12) {
          const x = pad + (i / reviewPeaks.length) * span;
          const amp = reviewPeaks[i] * reach;
          dotAt(x, cy - amp); dotAt(x, cy + amp);
        }
        if (reviewDuration > 0) {
          const px = pad + (playPosRef.current / reviewDuration) * span;
          for (let y = cy - reach; y <= cy + reach; y += 12) dotAt(px, y);
        }
      } else {
        // nothing flowing: the station's own test figure, so the window never sits dead
        lift = 0;
        const amp = 0.58 + 0.04 * Math.sin(t * 0.7), N = 512, wv = (Math.PI * 2) / N;
        for (let i = 0; i < N; i += STEP) {
          const x = amp * Math.sin(2 * wv * i + t * 0.25), y = amp * Math.sin(3 * wv * i);
          dotAt(cx + x * reachX, cy - y * reach);
        }
      }
      last = now;
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [rec.analyser, rec.state, pageState, reviewPeaks, reviewDuration]);

  // Send
  const send = useCallback(async () => {
    audioRef.current?.pause(); setPlaying(false);
    if (!rec.blob) return;
    setSendError(null); setPageState('transmitting');
    try {
      const form = new FormData();
      form.append('audio', rec.blob, 'transmission.webm');
      form.append('handle', handle);
      const res = await fetch('/api/transmissions', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({ ok: false, error: 'bad_response' }));
      if (!res.ok || !json.ok) { setSendError(json.error || 'send_failed'); setPageState(null); return; }
      setPageState('sent');
    } catch { setSendError('network_failed'); setPageState(null); }
  }, [handle, rec.blob]);

  const sendAnother = useCallback(() => {
    setPageState(null); setSendError(null); setHandle(''); rec.reset();
  }, [rec]);

  const status = (() => {
    if (pageState === 'transmitting') return 'TRANSMITTING';
    if (pageState === 'sent') return 'RECEIVED';
    switch (rec.state) {
      case 'idle': return 'IDLE'; case 'armed': return 'ARMED';
      case 'recording': return 'REC'; case 'paused': return 'PAUSED';
      case 'review': return 'REVIEW'; case 'error': return 'ERROR';
      default: return 'IDLE';
    }
  })();

  const isReview = rec.state === 'review' && !pageState;
  const transmitting = pageState === 'transmitting';
  const sent = pageState === 'sent';

  const readout: [string, string][] = [
    ['MODE',     'AUDIO RECORDER'],
    ['FORMAT',   'WEBM / OPUS'],
    ['DURATION', `${fmtDuration(rec.duration)} / ${fmtDuration(MAX_DURATION)}`],
    ['LEVEL',    `${levelBar(rec.peakLevel)}  ${levelDb(rec.peakLevel)}`],
    ['STATUS',   status],
  ];

  const FG = MID;
  const statusColor = status === 'REC' ? '#ff4a4a' : FG;

  return (
    // the station's plate stood on end: window on top, readout under it, controls at the foot
    <div className="tx-stack" style={{ fontFamily: MONO, color: FG }}>
      <style>{`
        .tx-stack { position: absolute; top: 24px; left: 24px; }
        .tx-plate { position: relative; width: min(${PLATE_W}px, calc(100vw - 32px)); box-sizing: border-box;
          display: flex; flex-direction: column; padding: 6px; border: 1px solid currentColor;
          font-size: 11px; letter-spacing: 0.04em; font-variant-numeric: tabular-nums;
          box-shadow: 0 0 3px rgba(137,122,95,0.3); text-shadow: 0 0 3px rgba(137,122,95,0.3); isolation: isolate; }
        .tx-plate::before { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(0,0,0,0.02);
          backdrop-filter: blur(1px); -webkit-backdrop-filter: blur(1px); }
        @media (max-width: 715px) { .tx-stack { left: 16px; } }
      `}</style>
      {/* ── HEADER — outside the device, above it ── */}
      <div style={{ marginBottom: 14, fontSize: 10, lineHeight: '17px', textShadow: '0 0 3px rgba(137,122,95,0.3)' }}>
        <div>{'> RECORD TRANSMISSION'}</div>
        <div>{'// TRANSMIT TO RADIO'}</div>
        <div>{'// SAY ANYTHING'}</div>
      </div>
      <div className="tx-plate">
      <div
        style={{
          border: '1px solid currentColor', boxShadow: '0 0 3px rgba(137,122,95,0.3)',
          background: 'rgba(0,0,0,0.03)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
          display: 'flex', justifyContent: 'center', lineHeight: 0, padding: '6px 0',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block', width: 'calc(100% - 12px)', height: SH, margin: 'auto 6px', color: 'inherit',
            filter: 'drop-shadow(0 0 3px rgba(137,122,95,0.95)) drop-shadow(0 0 9px rgba(137,122,95,0.7))',
          }}
        />
      </div>

      <div style={{ padding: '10px 6px 4px' }}>
      {/* ── READOUT — the station plate's own type ── */}
      <div style={{ display: 'grid', rowGap: 3 }}>
        {readout.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 22 }}>
            <span style={{ color: FG, minWidth: 70 }}>{label}</span>
            <span style={{ color: label === 'STATUS' ? statusColor : FG, whiteSpace: 'nowrap' }}>{value}</span>
          </div>
        ))}
        {rec.error && <div style={{ marginTop: 4, color: '#ff4a4a', width: 0, minWidth: '100%' }}>{rec.error}</div>}
        {sendError && (
          <div style={{ marginTop: 4, color: '#ff4a4a', display: 'flex', alignItems: 'center', gap: 8, width: 0, minWidth: '100%' }}>
            <span>TRANSMISSION FAILED — {sendError.toUpperCase()}</span>
            <button type="button" onClick={() => setSendError(null)}
              style={{ fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit', color: '#ff4a4a',
                background: 'none', border: '1px solid rgba(200,0,0,0.3)', padding: '1px 5px', cursor: 'pointer' }}>
              ×
            </button>
          </div>
        )}
      </div>

      {/* ── HANDLE ── */}
      <div style={{ display: 'flex', gap: 22, alignItems: 'center', marginTop: 10, width: 0, minWidth: '100%' }}>
        <span style={{ color: FG, minWidth: 70 }}>HANDLE</span>
        <input type="text" value={handle} maxLength={MAX_HANDLE} disabled={!isReview}
          onChange={(e) => setHandle(e.target.value)}
          placeholder={isReview ? 'optional' : ''}
          style={{
            fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit', color: FG,
            background: 'transparent', border: 'none',
            padding: '2px 0', flex: 1, minWidth: 0, outline: 'none', opacity: isReview ? 1 : 0.4,
          }} />
      </div>

      </div>

      {/* ── BUTTONS — the plate's foot ── */}
      <div style={{ display: 'flex', gap: '2px 22px', flexWrap: 'wrap', marginTop: 10, padding: '6px 6px 0', borderTop: '1px solid currentColor' }}>
        <Buttons
          recState={rec.state} transmitting={transmitting} sent={sent}
          playing={playing} loop={loop}
          onArm={() => rec.start()} onStop={rec.stop}
          onPauseRecord={rec.pause} onResumeRecord={rec.resume}
          onPlayback={togglePlayback} onToggleLoop={() => setLoop(l => !l)}
          onReRecord={() => { rec.reset(); void rec.start(); }}
          onTransmit={send} onSendAnother={sendAnother}
          onRetry={() => { rec.reset(); void rec.start(); }}
        />
      </div>
      </div>
    </div>
  );
}

// ── plate-style button: the station's bare glowing type, no chrome ──────────
function ScopeButton({ onClick, children, disabled, red, ink }: {
  onClick: () => void; children: React.ReactNode;
  active?: boolean; disabled?: boolean; red?: boolean; ink?: string;
}) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; }}
      onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = ''; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = ''; }}
      style={{
        all: 'unset',
        fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em',
        color: ink ?? (red ? '#ff4a4a' : MID),
        textShadow: '0 0 3px color-mix(in srgb, currentColor 45%, transparent)',
        opacity: disabled ? 0.45 : 1,
        padding: '4px 0', cursor: disabled ? 'default' : 'pointer',
      } as React.CSSProperties}>
      {children}
    </button>
  );
}

// ── button sets ─────────────────────────────────────────────────────────────
interface ButtonsProps {
  recState: ReturnType<typeof useRecorder>['state'];
  transmitting: boolean; sent: boolean; playing: boolean; loop: boolean;
  onArm: () => void; onStop: () => void; onPauseRecord: () => void;
  onResumeRecord: () => void; onPlayback: () => void; onToggleLoop: () => void;
  onReRecord: () => void; onTransmit: () => void; onSendAnother: () => void;
  onRetry: () => void;
}
function Buttons(p: ButtonsProps) {
  if (p.sent) return (
    <>
      <ScopeButton onClick={() => {}} active disabled>[ RECEIVED ✓ ]</ScopeButton>
      <ScopeButton onClick={p.onSendAnother}>[ SEND ANOTHER ]</ScopeButton>
    </>
  );
  if (p.transmitting) return <ScopeButton onClick={() => {}} disabled>[ TRANSMITTING... ]</ScopeButton>;
  if (p.recState === 'error') return <ScopeButton onClick={p.onRetry}>[ RETRY ]</ScopeButton>;
  if (p.recState === 'idle') return <ScopeButton onClick={p.onArm} ink="#00ffff">[ ARM ]</ScopeButton>;
  if (p.recState === 'armed') return <ScopeButton onClick={() => {}} disabled>[ ACQUIRING... ]</ScopeButton>;
  if (p.recState === 'recording') return (
    <>
      <ScopeButton onClick={p.onPauseRecord}>[ ❚❚ PAUSE ]</ScopeButton>
      <ScopeButton onClick={p.onStop} red active>[ ■ STOP ]</ScopeButton>
    </>
  );
  if (p.recState === 'paused') return (
    <>
      <ScopeButton onClick={p.onResumeRecord}>[ ● RESUME ]</ScopeButton>
      <ScopeButton onClick={p.onStop} red>[ ■ STOP ]</ScopeButton>
    </>
  );
  return (
    <>
      <ScopeButton onClick={p.onPlayback}>{p.playing ? '[ ❚❚ PAUSE ]' : '[ ▶ PLAYBACK ]'}</ScopeButton>
      <ScopeButton onClick={p.onToggleLoop} active={p.loop}>{p.loop ? '[ ↻ LOOP ON ]' : '[ ↻ LOOP ]'}</ScopeButton>
      <ScopeButton onClick={p.onReRecord}>[ RE-RECORD ]</ScopeButton>
      <ScopeButton onClick={p.onTransmit}>[ TRANSMIT → ]</ScopeButton>
    </>
  );
}
