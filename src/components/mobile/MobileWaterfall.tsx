'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { MONO, downsample } from '@/components/instruments/retro';

/**
 * Mobile waterfall — same 3-D spectral-decay algorithm as Waterfall3D but rendered
 * black-on-white to match the MobileScope signal-artifact aesthetic. No cyan, no
 * magenta chrome: just aliased black terrain lines on a white field inside the
 * black-border box the parent provides.
 */

const BINS = 84;
const ROWS = 46;
const PUSH_EVERY = 2;

export function MobileWaterfall({ width, height }: { width: number; height: number }) {
  const { analyserFreq, isPlaying, mode } = useAudio();
  const aRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aRef.current = analyserFreq; }, [analyserFreq]);
  useEffect(() => { liveRef.current = isPlaying && mode !== 'idle'; }, [isPlaying, mode]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowsRef = useRef<Float32Array[]>([]);
  const freqRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(2048));
  const frameRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr); c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    rowsRef.current = Array.from({ length: ROWS }, () => new Float32Array(BINS).fill(0.02));
  }, [width, height]);

  const pushRow = useCallback((live: boolean) => {
    const rows = rowsRef.current;
    const row = rows.pop()!;
    const a = aRef.current;
    if (live && a) {
      const f = freqRef.current;
      a.getByteFrequencyData(f);
      downsample(f, BINS, row, 0.5);
      for (let i = 0; i < BINS; i++) row[i] = Math.pow(row[i], 1.35);
    } else {
      for (let i = 0; i < BINS; i++) row[i] = 0.015 + Math.random() * 0.02;
    }
    rows.unshift(row);
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const w = width, h = height;

    // white field — no border (parent div handles the 1px black border)
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    const ML = 12, MR = 8, MT = 14, MB = 14;
    const dxBack = (w - ML - MR) * 0.22;
    const dyBack = (h - MT - MB) * 0.52;
    const usableW = (w - ML - MR) - dxBack;
    const baseY = h - MB;
    const magH = (h - MT - MB) * 0.5;

    const rows = rowsRef.current;
    const R = rows.length;

    for (let r = R - 1; r >= 0; r--) {
      const t = r / (R - 1);
      const xs = ML + t * dxBack;
      const ys = -t * dyBack;
      const row = rows[r];

      // fill white beneath each row → occludes ridges behind (hidden-line removal)
      ctx.beginPath();
      for (let i = 0; i < BINS; i++) {
        const x = xs + (i / (BINS - 1)) * usableW;
        const y = baseY + ys - row[i] * magH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(xs + usableW, baseY + ys);
      ctx.lineTo(xs, baseY + ys);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();

      // black trace — dimmer toward the back via opacity
      ctx.beginPath();
      for (let i = 0; i < BINS; i++) {
        const x = xs + (i / (BINS - 1)) * usableW;
        const y = baseY + ys - row[i] * magH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(0,0,0,${(0.2 + 0.8 * (1 - t)).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Technical axis labels — black, small mono type
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.font = `7px ${MONO}`;

    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText('453.7', ML, 3);
    ctx.textAlign = 'right';
    ctx.fillText('TIME 0-2048ms', w - MR, 3);

    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText('0', ML, h - 2);
    ctx.textAlign = 'center';
    ctx.fillText('FREQUENCY', ML + (w - ML - MR) * 0.4, h - 2);
    ctx.textAlign = 'right';
    ctx.fillText('11.0 kHz', w - MR, h - 2);

    ctx.save();
    ctx.translate(5, MT + (h - MT - MB) * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText('MAGNITUDE', 0, 0);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'right';
    ctx.fillText('TIME ↗', w - MR - dxBack * 0.7, h - MB - 2);
  }, [width, height]);

  const animate = useCallback(() => {
    if (frameRef.current % PUSH_EVERY === 0) pushRow(liveRef.current);
    frameRef.current++;
    draw();
    rafRef.current = requestAnimationFrame(animate);
  }, [pushRow, draw]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  return (
    <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width, height }} />
  );
}
