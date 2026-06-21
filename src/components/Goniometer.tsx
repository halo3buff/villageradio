'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';

const VR_FONT = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const SAMPLE_COUNT = 512;

// "Found screenshot" of real audio software — native plugin colors on a dark
// window, exempt from the page's black/white/red rule.
const BG = '#191a22';
const BG_DECAY = 'rgba(25, 26, 34, 0.20)';
const GRID = 'rgba(150, 162, 196, 0.28)';
const GRID_STRONG = 'rgba(150, 162, 196, 0.40)';
const TRACE = 'rgba(96, 214, 236, 0.85)';
const LABEL = 'rgba(210, 216, 236, 0.88)';

function drawPolarGrid(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  // Concentric rings
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (const f of [0.33, 0.66, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Diagonal X — two lines crossing at 45° through the center
  ctx.strokeStyle = GRID_STRONG;
  const d = R * Math.SQRT1_2;
  ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - d, cy + d); ctx.lineTo(cx + d, cy - d); ctx.stroke();
}

// Six-fingered blue hand — decorative plugin chrome.
function SixFingerHand() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
      <g fill="#6f86e0">
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
        width: 17, height: 14, borderRadius: 3, background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.10)', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </span>
  );
}

export function Goniometer({ size = 430 }: { size?: number }) {
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
  const R = size * 0.44;          // grid radius
  const plot = R * 0.92;          // full-scale plotting radius

  // Initialise canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, size, size);
      drawPolarGrid(ctx, cx, cy, R);
    }
  }, [size, cx, cy, R]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }
    const w = canvas.width;
    const h = canvas.height;

    // Phosphor decay toward the dark window background
    ctx.fillStyle = BG_DECAY;
    ctx.fillRect(0, 0, w, h);
    drawPolarGrid(ctx, cx, cy, R);

    const aL = analyserLRef.current;
    const aR = analyserRRef.current;

    // Clip the trace to the circle so it never spills into the corners
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
        // 45°-rotated goniometer mapping: mono (L=R) → straight up,
        // L-only → up-left, R-only → up-right.
        const x = cx + (r - l) * plot * 0.5;
        const y = cy - (l + r) * plot * 0.5;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        sumLR += l * r; sumLL += l * l; sumRR += r * r;
      }
      ctx.stroke();

      // Throttled correlation for the bottom meter
      const now = performance.now();
      if (now - lastCorrRef.current > 120) {
        lastCorrRef.current = now;
        const denom = Math.sqrt(sumLL * sumRR);
        setCorrelation(denom > 1e-6 ? Math.max(-1, Math.min(1, sumLR / denom)) : 0);
      }
    } else {
      // Idle: faint noise floor at center
      ctx.fillStyle = TRACE;
      for (let i = 0; i < 40; i++) {
        const l = (Math.random() - 0.5) * 0.04;
        const r = (Math.random() - 0.5) * 0.04;
        ctx.fillRect(cx + (r - l) * plot * 0.5, cy - (l + r) * plot * 0.5, 1, 1);
      }
    }
    ctx.restore();

    rafRef.current = requestAnimationFrame(animate);
  }, [cx, cy, R, plot]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  const handleToggle = () => {
    if (isBroadcasting) pause();
    else broadcastPlay();
  };

  // Label anchor points on the circle boundary
  const diag = R * Math.SQRT1_2;
  const labelStyle: React.CSSProperties = {
    position: 'absolute', fontFamily: VR_FONT, fontSize: 11, color: LABEL,
    letterSpacing: '0.05em', pointerEvents: 'none',
  };

  // Bottom correlation meter: map [-1,1] → bar from center
  const corrPct = (correlation * 50); // -50%..+50% from center

  return (
    <div
      style={{
        width: size,
        fontFamily: VR_FONT,
        border: '1px solid #000000',
        background: BG,
        transform: 'rotate(-1.5deg)',
        transformOrigin: 'center center',
      }}
    >
      {/* Title bar — plugin window chrome */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px', background: '#23242e',
          borderBottom: '1px solid rgba(0,0,0,0.5)',
        }}
      >
        {/* Ableton on/off → red play/stop */}
        <button
          onClick={handleToggle}
          aria-label={isBroadcasting ? 'Stop broadcast' : 'Play broadcast'}
          style={{
            width: 15, height: 15, borderRadius: '50%', cursor: 'pointer', padding: 0,
            background: isBroadcasting ? '#ff2a2a' : 'transparent',
            border: `2px solid ${isBroadcasting ? '#ff2a2a' : 'rgba(255,42,42,0.65)'}`,
            boxShadow: isBroadcasting ? '0 0 6px rgba(255,42,42,0.55)' : 'none',
            transition: 'background 0.15s ease, box-shadow 0.15s ease',
          }}
        />
        <span style={{ color: '#e8e6ef', fontSize: 13, letterSpacing: '0.02em' }}>Broadcast</span>
        <SixFingerHand />
        <span style={{ flex: 1 }} />
        <ChromeButton><span style={{ width: 8, height: 6, border: '1px solid rgba(220,224,240,0.7)', borderRadius: 1, display: 'block' }} /></ChromeButton>
        <ChromeButton><span style={{ width: 7, height: 7, border: '1px solid rgba(220,224,240,0.7)', borderRadius: '50%', display: 'block' }} /></ChromeButton>
        <ChromeButton><span style={{ width: 7, height: 7, background: 'rgba(220,224,240,0.7)', borderRadius: 1, display: 'block' }} /></ChromeButton>
      </div>

      {/* Goniometer display */}
      <div style={{ position: 'relative', width: size, height: size, background: BG }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: size, height: size }} />
        <span style={{ ...labelStyle, left: cx, top: cy - R - 16, transform: 'translateX(-50%)' }}>M</span>
        <span style={{ ...labelStyle, left: cx - diag - 14, top: cy - diag - 14 }}>L</span>
        <span style={{ ...labelStyle, left: cx + diag + 5, top: cy - diag - 14 }}>R</span>
        <span style={{ ...labelStyle, left: cx + R + 5, top: cy + R * 0.12 }}>S</span>
      </div>

      {/* Bottom correlation meter */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 10px', background: '#23242e',
          borderTop: '1px solid rgba(0,0,0,0.5)',
          fontSize: 10, color: 'rgba(206,212,232,0.7)', letterSpacing: '0.05em',
        }}
      >
        <span>-1</span>
        <div style={{ position: 'relative', flex: 1, height: 8, background: 'rgba(255,255,255,0.06)' }}>
          {/* center tick */}
          <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.18)' }} />
          {/* correlation bar from center */}
          <span
            style={{
              position: 'absolute', top: 1, bottom: 1,
              left: corrPct >= 0 ? '50%' : `${50 + corrPct}%`,
              width: `${Math.abs(corrPct)}%`,
              background: TRACE,
            }}
          />
          {/* center "0" label */}
          <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', color: 'rgba(206,212,232,0.5)', fontSize: 9 }}>0</span>
        </div>
        <span>+1</span>
      </div>
    </div>
  );
}
