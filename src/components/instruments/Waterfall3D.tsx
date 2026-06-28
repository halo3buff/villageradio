'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { MONO, CYAN, FRAME, downsample } from './retro';

/**
 * 3-D WATERFALL (Spectral Decay) — Hypersignal-style terrain.
 *
 * Each frame's frequency spectrum becomes one horizontal trace; successive traces
 * recede up-and-right into depth (oblique projection), extruding frequency over time.
 * Hidden-line removal is the painter's algorithm: rows are drawn back-to-front and the
 * area under each trace is filled black, occluding the ridges behind it. Line-based,
 * 1px, no anti-aliasing flourishes — the jagged early-DSP look.
 */

const BINS = 84;       // frequency resolution across the front edge
const ROWS = 46;       // depth (time) resolution
const PUSH_EVERY = 2;  // frames between new traces — sets the scroll speed

export function Waterfall3D({ width, height }: { width: number; height: number }) {
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
    // seed the history with a flat floor so the terrain is never empty
    rowsRef.current = Array.from({ length: ROWS }, () => new Float32Array(BINS).fill(0.02));
  }, [width, height]);

  const pushRow = useCallback((live: boolean) => {
    const rows = rowsRef.current;
    const row = rows.pop()!;                 // reuse the oldest buffer (zero alloc)
    const a = aRef.current;
    if (live && a) {
      const f = freqRef.current;
      a.getByteFrequencyData(f);
      downsample(f, BINS, row, 0.5);
      for (let i = 0; i < BINS; i++) row[i] = Math.pow(row[i], 1.35); // emphasise peaks
    } else {
      for (let i = 0; i < BINS; i++) row[i] = 0.015 + Math.random() * 0.02;
    }
    rows.unshift(row);
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const w = width, h = height;

    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);

    const ML = 30, MR = 12, MT = 22, MB = 26;
    const dxBack = (w - ML - MR) * 0.22;   // recede right
    const dyBack = (h - MT - MB) * 0.52;   // recede up
    const usableW = (w - ML - MR) - dxBack;
    const baseY = h - MB;
    const magH = (h - MT - MB) * 0.5;

    const rows = rowsRef.current;
    const R = rows.length;
    // back (oldest) → front (newest); paint black under each trace to occlude depth
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
      // close down to this row's baseline and fill black (hidden-line removal)
      ctx.lineTo(xs + usableW, baseY + ys);
      ctx.lineTo(xs, baseY + ys);
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();

      // re-stroke just the top profile in cyan, dimmer toward the back
      ctx.beginPath();
      for (let i = 0; i < BINS; i++) {
        const x = xs + (i / (BINS - 1)) * usableW;
        const y = baseY + ys - row[i] * magH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${CYAN},${(0.28 + 0.72 * (1 - t)).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // magenta window frame
    ctx.strokeStyle = FRAME; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    // reference-style readout strip (the window title bar names the instrument)
    ctx.fillStyle = `rgba(${CYAN},0.7)`; ctx.font = `8px ${MONO}`;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText('453.7', 6, 5);
    ctx.textAlign = 'right';
    ctx.fillStyle = `rgba(${CYAN},0.55)`;
    ctx.fillText('TIME 0-2048ms', w - 6, 5);

    ctx.save();
    ctx.translate(9, h / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${CYAN},0.6)`; ctx.font = `8px ${MONO}`;
    ctx.fillText('MAGNITUDE', 0, 0);
    ctx.restore();

    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = `rgba(${CYAN},0.6)`; ctx.font = `8px ${MONO}`;
    ctx.fillText('0', ML, h - 6);
    ctx.textAlign = 'center';
    ctx.fillText('FREQUENCY', ML + usableW / 2, h - 6);
    ctx.textAlign = 'right';
    ctx.fillText('11.0 kHz', ML + usableW, h - 6);

    // TIME depth arrow
    ctx.save();
    ctx.translate(w - 6, MT + 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = `rgba(${CYAN},0.45)`; ctx.font = `8px ${MONO}`;
    ctx.fillText('TIME ↗', 0, 0);
    ctx.restore();
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
