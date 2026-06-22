'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';

const VR_FONT = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const SAMPLE_COUNT = 512;

// Colors sampled from the reference screenshot (Goniometer_1.png).
const OUTER = '#5c5f68';            // outer window frame — medium grey
const OUTER_BORDER = '#3c3e45';     // thin dark outline
const HEADER_TOP = '#94a3c4';       // header — light blueish grey
const HEADER_BOT = '#828fb1';
const TITLE_TEXT = '#13212c';       // dark navy
const INNER_TOP = '#31323a';        // inner display — dark grey gradient
const INNER_BOT = '#202127';
const GRID = 'rgba(216, 220, 230, 0.20)';
const GRID_STRONG = 'rgba(216, 220, 230, 0.30)';
const TRACE = 'rgba(113, 207, 241, 0.9)';
const LABEL = 'rgba(176, 184, 202, 0.85)';
const FOOTER_TEXT = 'rgba(214, 218, 228, 0.7)';

function drawPolarGrid(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (const f of [0.33, 0.66, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = GRID_STRONG;
  const d = R * Math.SQRT1_2;
  ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - d, cy + d); ctx.lineTo(cx + d, cy - d); ctx.stroke();
}

// Six-fingered blue hand — decorative plugin chrome.
function SixFingerHand() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
      <g fill="#5566c8">
        <rect x="4" y="11" width="16" height="9" rx="3" />
        <rect x="4.0" y="5.5" width="2.1" height="7.5" rx="1.05" />
        <rect x="6.7" y="4.0" width="2.1" height="9" rx="1.05" />
        <rect x="9.4" y="3.3" width="2.1" height="9.7" rx="1.05" />
        <rect x="12.1" y="3.6" width="2.1" height="9.4" rx="1.05" />
        <rect x="14.8" y="4.6" width="2.1" height="8.4" rx="1.05" />
        <rect x="17.5" y="6.0" width="2.1" height="7" rx="1.05" />
      </g>
    </svg>
  );
}

// Decorative plugin-window buttons (top right) — placeholders, non-functional.
function ChromeButton({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        width: 19, height: 15, borderRadius: 3, background: '#34363f',
        border: '1px solid rgba(0,0,0,0.25)', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </span>
  );
}

export function Goniometer({ size = 384 }: { size?: number }) {
  const { isPlaying, mode, broadcastPlay, pause, analyserL, analyserR } = useAudio();
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  useEffect(() => { analyserLRef.current = analyserL; }, [analyserL]);
  useEffect(() => { analyserRRef.current = analyserR; }, [analyserR]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastCorrRef = useRef<number>(0);
  const [correlation, setCorrelation] = useState(0);

  const isBroadcasting = mode === 'broadcast' && isPlaying;

  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.44;
  const plot = R * 0.92;
  const PAD = 8;

  const fillGradient = useCallback((ctx: CanvasRenderingContext2D, alpha: number) => {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, INNER_TOP);
    g.addColorStop(1, INNER_BOT);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }, [size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      fillGradient(ctx, 1);
      drawPolarGrid(ctx, cx, cy, R);
    }
  }, [size, cx, cy, R, fillGradient]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) { rafRef.current = requestAnimationFrame(animate); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(animate); return; }

    // Phosphor decay toward the gradient background
    fillGradient(ctx, 0.18);
    drawPolarGrid(ctx, cx, cy, R);

    const aL = analyserLRef.current;
    const aR = analyserRRef.current;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    if (aL && aR) {
      const bufL = new Float32Array(aL.fftSize);
      const bufR = new Float32Array(aR.fftSize);
      aL.getFloatTimeDomainData(bufL);
      aR.getFloatTimeDomainData(bufR);
      const stride = Math.max(1, Math.floor(bufL.length / SAMPLE_COUNT));

      ctx.strokeStyle = TRACE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let sumLR = 0, sumLL = 0, sumRR = 0;
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const idx = i * stride;
        const l = bufL[idx];
        const r = bufR[idx];
        // 45°-rotated goniometer mapping: mono → straight up.
        const x = cx + (r - l) * plot * 0.5;
        const y = cy - (l + r) * plot * 0.5;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        sumLR += l * r; sumLL += l * l; sumRR += r * r;
      }
      ctx.stroke();

      const now = performance.now();
      if (now - lastCorrRef.current > 120) {
        lastCorrRef.current = now;
        const denom = Math.sqrt(sumLL * sumRR);
        setCorrelation(denom > 1e-6 ? Math.max(-1, Math.min(1, sumLR / denom)) : 0);
      }
    } else {
      ctx.fillStyle = TRACE;
      for (let i = 0; i < 40; i++) {
        const l = (Math.random() - 0.5) * 0.04;
        const r = (Math.random() - 0.5) * 0.04;
        ctx.fillRect(cx + (r - l) * plot * 0.5, cy - (l + r) * plot * 0.5, 1, 1);
      }
    }
    ctx.restore();

    rafRef.current = requestAnimationFrame(animate);
  }, [cx, cy, R, plot, fillGradient]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  const handleToggle = () => { if (isBroadcasting) pause(); else broadcastPlay(); };

  const diag = R * Math.SQRT1_2;
  const labelStyle: React.CSSProperties = {
    position: 'absolute', fontFamily: VR_FONT, fontSize: 11, color: LABEL,
    letterSpacing: '0.05em', pointerEvents: 'none',
  };
  const corrPct = correlation * 50;

  return (
    <div
      style={{
        width: size + PAD * 2,
        background: OUTER,
        border: `1px solid ${OUTER_BORDER}`,
        borderRadius: 7,
        fontFamily: VR_FONT,
        overflow: 'hidden',
      }}
    >
      {/* Header — outer window title bar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 34,
          padding: '0 9px',
          background: `linear-gradient(180deg, ${HEADER_TOP}, ${HEADER_BOT})`,
        }}
      >
        {/* Ableton on/off → red play/stop */}
        <button
          onClick={handleToggle}
          aria-label={isBroadcasting ? 'Stop broadcast' : 'Play broadcast'}
          style={{
            width: 14, height: 14, borderRadius: '50%', cursor: 'pointer', padding: 0, flex: 'none',
            background: isBroadcasting ? '#ff2a2a' : 'transparent',
            border: `2px solid ${isBroadcasting ? '#ff2a2a' : 'rgba(196,42,42,0.9)'}`,
            boxShadow: isBroadcasting ? '0 0 5px rgba(255,42,42,0.6)' : 'none',
            transition: 'background 0.15s ease, box-shadow 0.15s ease',
          }}
        />
        <span style={{ color: TITLE_TEXT, fontSize: 13, fontWeight: 500, letterSpacing: '0.01em' }}>Broadcast</span>
        <SixFingerHand />
        <span style={{ flex: 1 }} />
        <ChromeButton><span style={{ width: 9, height: 6, border: '1px solid rgba(220,224,235,0.8)', borderRadius: 1, display: 'block' }} /></ChromeButton>
        <ChromeButton><span style={{ width: 7, height: 7, border: '1px solid rgba(220,224,235,0.8)', borderRadius: '50%', display: 'block' }} /></ChromeButton>
        <ChromeButton><span style={{ width: 7, height: 7, background: 'rgba(220,224,235,0.8)', borderRadius: 1, display: 'block' }} /></ChromeButton>
      </div>

      {/* Inner window — the goniometer display */}
      <div
        style={{
          position: 'relative', width: size, height: size, margin: `${PAD}px ${PAD}px 0`,
          borderRadius: 5, overflow: 'hidden',
          background: `linear-gradient(180deg, ${INNER_TOP}, ${INNER_BOT})`,
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: size, height: size }} />
        <span style={{ ...labelStyle, left: cx, top: cy - R - 16, transform: 'translateX(-50%)' }}>M</span>
        <span style={{ ...labelStyle, left: cx - diag - 14, top: cy - diag - 14 }}>L</span>
        <span style={{ ...labelStyle, left: cx + diag + 5, top: cy - diag - 14 }}>R</span>
        <span style={{ ...labelStyle, left: cx + R + 5, top: cy + R * 0.12 }}>S</span>
      </div>

      {/* Footer — correlation meter */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 36,
          padding: `0 ${PAD + 2}px`, fontSize: 10, color: FOOTER_TEXT, letterSpacing: '0.05em',
        }}
      >
        <span>-1</span>
        <div style={{ position: 'relative', flex: 1, height: 8, background: 'rgba(0,0,0,0.30)', borderRadius: 2 }}>
          <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.16)' }} />
          <span
            style={{
              position: 'absolute', top: 1, bottom: 1,
              left: corrPct >= 0 ? '50%' : `${50 + corrPct}%`,
              width: `${Math.abs(corrPct)}%`, background: TRACE, borderRadius: 1,
            }}
          />
          <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', color: 'rgba(214,218,228,0.45)', fontSize: 9 }}>0</span>
        </div>
        <span>+1</span>
      </div>
    </div>
  );
}
