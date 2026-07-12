'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { useTheme } from '@/components/ThemeProvider';
import { LIGHT_THEMES } from '@/lib/theme';
import { dspPalette, downsample, initRetroCanvas, pixelFont, stackLabel, watermark } from '@/components/instruments/retro';

/**
 * Hypersignal "3-D Spectrograph (Waterfall)" — bright cyan wireframe terrain
 * inside a magenta 3-D box frame, hidden-line removal via painter's algorithm,
 * stacked MAGNITUDE UNITS axis, Hz/Div ticks and a cyan Time-spanned readout.
 * Exact VGA-on-black on the dark theme, same grammar on white for default.
 */

const BINS = 84;
const ROWS = 56;
const PUSH_EVERY = 2;

export function MobileWaterfall() {
  const { analyserFreq, isPlaying, mode } = useAudio();
  const { name: theme } = useTheme();
  const lightRef = useRef(true);
  useEffect(() => { lightRef.current = LIGHT_THEMES.has(theme); }, [theme]);
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
      dimsRef.current = { width: Math.round(width), height: Math.round(height) };
      initRetroCanvas(el, width, height);
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
    const P = dspPalette(lightRef.current);

    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    const ML = 34, MR = 10, MT = 18, MB = 18;
    const dxBack = (w - ML - MR) * 0.22;
    const dyBack = (h - MT - MB) * 0.52;
    const usableW = (w - ML - MR) - dxBack;
    const baseY = h - MB;
    const magH = (h - MT - MB) * 0.5;

    // ── magenta 3-D box frame (back half — drawn before the terrain occludes it)
    const bx = ML + dxBack, by = baseY - dyBack; // back-bottom-left
    ctx.strokeStyle = P.frameDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx + usableW, by);                    // back bottom
    ctx.moveTo(bx, by); ctx.lineTo(bx, by - magH);                       // back-left vertical
    ctx.moveTo(bx, by - magH); ctx.lineTo(bx + usableW, by - magH);      // back top
    ctx.moveTo(ML, baseY); ctx.lineTo(bx, by);                           // left receding
    ctx.moveTo(ML, baseY - magH); ctx.lineTo(bx, by - magH);             // top-left receding
    ctx.stroke();

    const rows = rowsRef.current;
    const R = rows.length;
    // back (oldest) → front (newest); fill bg under each trace = hidden-line removal
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
      ctx.fillStyle = P.bg;
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < BINS; i++) {
        const x = xs + (i / (BINS - 1)) * usableW;
        const y = baseY + ys - row[i] * magH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = P.cyan;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── front of the box frame (over the terrain edges)
    ctx.strokeStyle = P.frame;
    ctx.beginPath();
    ctx.moveTo(ML, baseY); ctx.lineTo(ML + usableW, baseY);              // front bottom
    ctx.moveTo(ML, baseY); ctx.lineTo(ML, baseY - magH);                 // front-left vertical
    ctx.moveTo(ML + usableW, baseY); ctx.lineTo(bx + usableW, by);       // right receding
    ctx.stroke();

    // ── labels
    ctx.font = pixelFont(10);

    // header: script watermark + cyan Time-spanned readout
    watermark(ctx, ML + 60, 12, lightRef.current ? P.watermark : P.label, 'left', 10);
    ctx.font = pixelFont(10);
    ctx.fillStyle = P.readout;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('Time spanned: 0.000-2.048 S', w - MR, 2);

    // stacked MAGNITUDE UNITS on the left
    ctx.fillStyle = P.label;
    stackLabel(ctx, 'MAGNITUDE', 8, MT + 6, 9);
    stackLabel(ctx, 'UNITS', 20, MT + 24, 9);

    // frequency axis along the front bottom edge
    ctx.font = pixelFont(10);
    ctx.fillStyle = P.label;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('0.000', ML, baseY + 3);
    ctx.textAlign = 'center';
    ctx.fillText('FREQUENCY', ML + usableW / 2, baseY + 3);
    ctx.textAlign = 'right';
    ctx.fillText('200.0 Hz/Div', ML + usableW, baseY + 3);

    // TIME along the receding right edge
    ctx.save();
    ctx.translate(ML + usableW + dxBack * 0.5 + 8, baseY - dyBack * 0.5);
    ctx.rotate(-Math.atan2(dyBack, dxBack));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = P.labelDim;
    ctx.fillText('TIME(S)', 0, 0);
    ctx.restore();
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
