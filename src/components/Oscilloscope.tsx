'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRecorder } from '@/lib/use-recorder';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const SANS = "'Helvetica Neue', Arial, sans-serif";
const MAX_HANDLE = 64;
const MAX_DURATION = 180;

// Win3.1 / DSPower chrome palette
const CHROME    = '#ececec';
const CHROME_HI = '#f6f6f6';
const CHROME_LO = '#dcdcdc';
const CHROME_BD = '#8a8a8a';
const CHROME_TX = '#1c1c1c';

type PageState = 'transmitting' | 'sent' | null;

function fmtDuration(s: number): string {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`;
}
function levelBar(level: number): string {
  const cells = 12;
  const filled = Math.min(cells, Math.round(level * cells * 1.5));
  return '▮'.repeat(filled) + '▯'.repeat(cells - filled);
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

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const sweepXRef = useRef(0);

  useEffect(() => { if (rec.state === 'recording') setSendError(null); }, [rec.state]);

  useEffect(() => {
    const c = canvasRef.current, container = containerRef.current;
    if (!c || !container) return;

    const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      const cols = 12, rows = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.07)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= cols; i++) {
        ctx.beginPath(); ctx.moveTo((i * w) / cols, 0); ctx.lineTo((i * w) / cols, h); ctx.stroke();
      }
      for (let j = 0; j <= rows; j++) {
        ctx.beginPath(); ctx.moveTo(0, (j * h) / rows); ctx.lineTo(w, (j * h) / rows); ctx.stroke();
      }
      // centre axis slightly darker
      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    };

    const resize = () => {
      const w = Math.floor(container.clientWidth), h = Math.floor(container.clientHeight);
      if (!w || !h) return;
      c.width = w; c.height = h;
      const ctx = c.getContext('2d'); if (!ctx) return;
      drawGrid(ctx, w, h); sweepXRef.current = 0;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    const draw = () => {
      const ctx = c.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }
      const w = c.width, h = c.height;
      const a = rec.analyser;

      if (a && rec.state === 'recording') {
        const buf = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(buf);
        let peak = 0;
        const sampleCount = Math.min(buf.length, 512);
        for (let i = 0; i < sampleCount; i++) {
          const v = Math.abs(buf[i]); if (v > peak) peak = v;
        }
        const amp = peak * (h / 2) * 0.92;
        const cy = h / 2, x = sweepXRef.current;

        // erase column
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, 0, 2, h);
        // redraw grid segment
        ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1;
        for (let i = 0; i <= 12; i++) {
          const gx = (i * w) / 12;
          if (Math.abs(gx - x) < 2) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.14)';
        ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + 2, cy); ctx.stroke();

        // trace — black line
        ctx.strokeStyle = 'rgba(0,0,0,0.82)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x + 0.5, cy - amp); ctx.lineTo(x + 0.5, cy + amp); ctx.stroke();

        // sweep cursor
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 1, 0, 1, h);

        sweepXRef.current = (x + 1) % w;
      }

      if (rec.state === 'review' && reviewPeaks) {
        drawGrid(ctx, w, h);
        const cy = h / 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
        for (let i = 0; i < reviewPeaks.length; i++) {
          const x = (i / reviewPeaks.length) * w;
          const amp = reviewPeaks[i] * (h / 2) * 0.92;
          ctx.beginPath(); ctx.moveTo(x, cy - amp); ctx.lineTo(x, cy + amp); ctx.stroke();
        }
        if (reviewDuration > 0) {
          const px = (playPosRef.current / reviewDuration) * w;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(Math.floor(px), 0, 1, h);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [rec.analyser, rec.state, reviewPeaks, reviewDuration]);

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

  const statusColor = status === 'REC' ? '#c00' : status === 'RECEIVED' ? '#000' : '#000';

  return (
    <div style={{ fontFamily: MONO, maxWidth: 720 }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 14, fontSize: 10, lineHeight: '17px', color: '#000' }}>
        <div>{'> RECORD TRANSMISSION'}</div>
        <div>{'// TELL A STORY'}</div>
        <div>{'// EXPLAIN YOURSELF'}</div>
      </div>

      {/* ── SCOPE FRAME — Win3.1 / DSPower chrome ── */}
      <div style={{ height: 24 }} />
      <div style={{ border: `1px solid ${CHROME_BD}`, boxSizing: 'border-box' }}>

        {/* title bar */}
        <div style={{
          height: 28,
          background: `linear-gradient(180deg, ${CHROME_HI}, ${CHROME_LO})`,
          borderBottom: `1px solid ${CHROME_BD}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 10px',
          fontFamily: SANS,
        }}>
          <span style={{ fontSize: 13, color: CHROME_TX, fontWeight: 400 }}>Waveform Monitor</span>
          <span style={{ fontSize: 9, color: '#666', fontFamily: MONO, letterSpacing: '0.08em' }}>CH-A</span>
        </div>

        {/* toolbar strip */}
        <div style={{
          height: 22,
          background: CHROME,
          borderBottom: `1px solid ${CHROME_BD}`,
          display: 'flex', alignItems: 'center',
          padding: '0 10px', gap: 16,
          fontFamily: MONO, fontSize: 8, letterSpacing: '0.06em', color: '#000',
        }}>
          <span>INPUT: MIC</span>
          <span>RATE: 48kHz</span>
          <span>BITS: 16</span>
          <span style={{ marginLeft: 'auto', color: status === 'REC' ? '#c00' : '#000' }}>
            {`● ${status}`}
          </span>
        </div>

        {/* canvas */}
        <div ref={containerRef} style={{ width: '100%', aspectRatio: '3 / 1', position: 'relative', lineHeight: 0 }}>
          <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>
      </div>

      {/* ── READOUT ── */}
      <div style={{ marginTop: 10, fontSize: 9, lineHeight: '16px', letterSpacing: '0.1em' }}>
        {readout.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 12 }}>
            <span style={{ color: '#000', minWidth: 72 }}>{label}</span>
            <span style={{ color: label === 'STATUS' ? statusColor : '#000' }}>{value}</span>
          </div>
        ))}
        {rec.error && <div style={{ marginTop: 4, color: '#c00' }}>{rec.error}</div>}
        {sendError && (
          <div style={{ marginTop: 4, color: '#c00', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>TRANSMISSION FAILED — {sendError.toUpperCase()}</span>
            <button type="button" onClick={() => setSendError(null)}
              style={{ fontFamily: 'inherit', fontSize: 9, letterSpacing: '0.1em', color: '#c00',
                background: 'none', border: '1px solid rgba(200,0,0,0.3)', padding: '1px 5px', cursor: 'pointer' }}>
              ×
            </button>
          </div>
        )}
      </div>

      {/* ── HANDLE ── */}
      <div style={{ display: 'flex', gap: 12, fontSize: 9, letterSpacing: '0.1em', alignItems: 'center', marginTop: 10 }}>
        <span style={{ color: '#000', minWidth: 72 }}>HANDLE</span>
        <input type="text" value={handle} maxLength={MAX_HANDLE} disabled={!isReview}
          onChange={(e) => setHandle(e.target.value)}
          placeholder={isReview ? 'optional' : ''}
          style={{
            fontFamily: 'inherit', fontSize: 9, letterSpacing: '0.1em', color: '#000',
            background: 'transparent', border: 'none', borderBottom: '1px solid #000',
            padding: '2px 0', flex: 1, outline: 'none', opacity: isReview ? 1 : 0.4,
          }} />
      </div>

      {/* ── BUTTONS ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
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
  );
}

// ── chrome-style button ──────────────────────────────────────────────────────
function ScopeButton({ onClick, children, active, disabled, red }: {
  onClick: () => void; children: React.ReactNode;
  active?: boolean; disabled?: boolean; red?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em',
        color: disabled ? '#aaa' : red && active ? '#c00' : '#000',
        background: hover && !disabled ? '#f0f0f0' : active ? '#e8e8e8' : '#fff',
        border: `1px solid ${disabled ? '#ddd' : red ? '#c00' : '#999'}`,
        padding: '4px 14px', cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.1s',
      }}>
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
  if (p.recState === 'idle') return <ScopeButton onClick={p.onArm}>[ ARM ]</ScopeButton>;
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
