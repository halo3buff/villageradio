'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { MONO, downsample } from '@/components/instruments/retro';

const BINS = 84;
const ROWS = 46;
const PUSH_EVERY = 2;

export function MobileWaterfall() {
  const { analyserFreq, isPlaying, mode } = useAudio();
  const aRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aRef.current = analyserFreq; }, [analyserFreq]);
  useEffect(() => { liveRef.current = isPlaying && mode !== 'idle'; }, [isPlaying, mode]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimsRef = useRef({ width: 0, height: 0 });
  const rowsRef = useRef<Float32Array[]>([]);
  const freqRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(2048));
  const frameRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const w = Math.round(width), h = Math.round(height);
      dimsRef.current = { width: w, height: h };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      const ctx = el.getContext('2d'); if (!ctx) return;
      ctx.scale(dpr, dpr);
      rowsRef.current = Array.from({ length: ROWS }, () => new Float32Array(BINS).fill(0.02));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pushRow = useCallback((live: boolean) => {
    const rows = rowsRef.current;
    if (!rows.length) return;
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
    const { width: w, height: h } = dimsRef.current;
    if (w === 0 || h === 0) return;

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

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.font = `7px ${MONO}`;

    ctx.textBaseline = 'top'; ctx.textAlign = 'right';
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
    ctx.fillText('TIME ->', w - MR - dxBack * 0.7, h - MB - 2);
  }, []);

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
    <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
  );
}
