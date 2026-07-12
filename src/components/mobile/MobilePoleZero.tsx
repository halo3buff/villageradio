'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { useTheme } from '@/components/ThemeProvider';
import { LIGHT_THEMES } from '@/lib/theme';
import { dspPalette, initRetroCanvas, pixelFont, watermark } from '@/components/instruments/retro';

const ORDER = 12;
const NSAMP = 1024;

function levinson(r: Float64Array, p: number): Float64Array {
  const a = new Float64Array(p + 1);
  a[0] = 1;
  let e = r[0];
  if (e <= 0) return a;
  for (let i = 1; i <= p; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / e;
    for (let j = 1, half = i >> 1; j <= half; j++) {
      const aj = a[j], aij = a[i - j];
      a[j] = aj + k * aij;
      a[i - j] = aij + k * aj;
    }
    a[i] = k;
    e *= 1 - k * k;
    if (e <= 1e-9) e = 1e-9;
  }
  return a;
}

function findRoots(a: Float64Array, n: number, re: Float64Array, im: Float64Array): void {
  let cre = 1, cim = 0; const sre = 0.4, sim = 0.9;
  for (let i = 0; i < n; i++) {
    re[i] = cre; im[i] = cim;
    const nre = cre * sre - cim * sim, nim = cre * sim + cim * sre;
    cre = nre; cim = nim;
  }
  for (let iter = 0; iter < 60; iter++) {
    let maxd = 0;
    for (let i = 0; i < n; i++) {
      let pre = 1, pim = 0;
      for (let k = 1; k <= n; k++) {
        const nre = pre * re[i] - pim * im[i] + a[k];
        const nim = pre * im[i] + pim * re[i];
        pre = nre; pim = nim;
      }
      let dre = 1, dim = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const xr = re[i] - re[j], xi = im[i] - im[j];
        const nre = dre * xr - dim * xi, nim = dre * xi + dim * xr;
        dre = nre; dim = nim;
      }
      const den = dre * dre + dim * dim || 1e-12;
      const qre = (pre * dre + pim * dim) / den;
      const qim = (pim * dre - pre * dim) / den;
      if (Number.isFinite(qre) && Number.isFinite(qim)) {
        re[i] -= qre; im[i] -= qim;
        const d = Math.abs(qre) + Math.abs(qim);
        if (d > maxd) maxd = d;
      }
    }
    if (maxd < 1e-6) break;
  }
}

export function MobilePoleZero() {
  const { analyserL, isPlaying, mode } = useAudio();
  const { name: theme } = useTheme();
  const lightRef = useRef(true);
  useEffect(() => { lightRef.current = LIGHT_THEMES.has(theme); }, [theme]);
  const aRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aRef.current = analyserL; }, [analyserL]);
  useEffect(() => { liveRef.current = isPlaying && mode !== 'idle'; }, [isPlaying, mode]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimsRef = useRef({ width: 0, height: 0 });
  const bufRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const winRef = useRef<Float64Array>(new Float64Array(NSAMP));
  const corrRef = useRef<Float64Array>(new Float64Array(ORDER + 1));
  const reRef = useRef<Float64Array>(new Float64Array(ORDER));
  const imRef = useRef<Float64Array>(new Float64Array(ORDER));
  const frameRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      dimsRef.current = { width: Math.round(width), height: Math.round(height) };
      initRetroCanvas(el, width, height);
      for (let i = 0; i < NSAMP; i++) winRef.current[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (NSAMP - 1));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const analyse = useCallback((live: boolean) => {
    const re = reRef.current, im = imRef.current, r = corrRef.current;
    const a = aRef.current;
    if (!live || !a) { for (let i = 0; i < ORDER; i++) { re[i] *= 0.9; im[i] *= 0.9; } return; }
    const buf = bufRef.current, win = winRef.current;
    a.getFloatTimeDomainData(buf);
    for (let lag = 0; lag <= ORDER; lag++) {
      let s = 0;
      for (let i = lag; i < NSAMP; i++) s += buf[i] * win[i] * buf[i - lag] * win[i - lag];
      r[lag] = s;
    }
    if (r[0] < 1e-6) { for (let i = 0; i < ORDER; i++) { re[i] *= 0.9; im[i] *= 0.9; } return; }
    r[0] *= 1.0001;
    const lpc = levinson(r, ORDER);
    findRoots(lpc, ORDER, re, im);
    for (let i = 0; i < ORDER; i++) {
      if (!Number.isFinite(re[i]) || !Number.isFinite(im[i])) { re[i] = 0; im[i] = 0; }
    }
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const { width: w, height: h } = dimsRef.current;
    if (w === 0 || h === 0) return;
    const P = dspPalette(lightRef.current);
    const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h - 20) / 2 - 14;

    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    // magenta plot frame + Re/Im axes
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(4.5, 14.5, w - 9, h - 19);
    ctx.strokeStyle = P.frameDim;
    ctx.beginPath();
    ctx.moveTo(cx - R * 1.12, Math.round(cy) + 0.5); ctx.lineTo(cx + R * 1.12, Math.round(cy) + 0.5);
    ctx.moveTo(Math.round(cx) + 0.5, cy - R * 1.12); ctx.lineTo(Math.round(cx) + 0.5, cy + R * 1.12);
    ctx.stroke();

    // unit circle (cyan) + half-radius reference
    ctx.strokeStyle = P.cyan;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = P.frameDim;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = P.label; ctx.font = pixelFont(10);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('+1', cx + R, cy + 3); ctx.fillText('-1', cx - R, cy + 3);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('Re', cx + R * 1.12 - 12, cy - 7);
    ctx.fillText('jIm', cx + 4, cy - R * 1.12 + 8);

    // poles — green ×, hot poles (near the unit circle) flare yellow
    const re = reRef.current, im = imRef.current;
    for (let i = 0; i < ORDER; i++) {
      let pr = re[i], pi = im[i];
      const mag = Math.hypot(pr, pi);
      if (mag > 1.06) { pr /= mag / 1.02; pi /= mag / 1.02; }
      const x = cx + pr * R, y = cy - pi * R;
      const hot = mag > 0.82;
      ctx.strokeStyle = hot ? P.yellow : P.green;
      ctx.lineWidth = 1; const s = hot ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
      ctx.stroke();
    }

    // header readout + watermark
    ctx.fillStyle = P.readout; ctx.font = pixelFont(10);
    ctx.textBaseline = 'top'; ctx.textAlign = 'right';
    ctx.fillText(`Pole-Zero Display  Order: ${ORDER}`, w - 6, 2);
    watermark(ctx, w - 8, h - 8, P.watermark, 'right', 10);
  }, []);

  const animate = useCallback(() => {
    if (frameRef.current % 2 === 0) analyse(liveRef.current);
    frameRef.current++;
    draw();
    rafRef.current = requestAnimationFrame(animate);
  }, [analyse, draw]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  return (
    <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
  );
}
