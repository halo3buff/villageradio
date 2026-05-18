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
    if (audioRef.current) audioRef.current.pause();
    setPlaying(false);
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
      default: return 'IDLE';
    }
  })();

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
          onArm={() => rec.start()}
          onStop={rec.stop}
          onPlayback={togglePlayback}
          onReRecord={() => { rec.reset(); }}
          onTransmit={send}
          onSendAnother={sendAnother}
          onRetry={() => { rec.reset(); void rec.start(); }}
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
