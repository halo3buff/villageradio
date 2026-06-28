'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { MONO, CYAN, FRAME, GRID, GRID_HOT } from './retro';

/**
 * POLE-ZERO DISPLAY (Z-PLANE) — a genuine Hypersignal/DSPower speech-DSP instrument.
 *
 * Each frame we fit an all-pole LPC model to the live audio (autocorrelation →
 * Levinson-Durbin → polynomial root-finding via Durand-Kerner) and plot the resulting
 * poles in the complex z-plane against the unit circle. The poles sit at the signal's
 * resonances (formants), so they dance toward the unit circle as the audio excites
 * different frequencies. Real DSP on real data — not decoration.
 */

const ORDER = 12;   // LPC order → up to 12 poles
const NSAMP = 1024; // analysis window length

// Levinson-Durbin recursion → LPC coefficients a[0..p], A(z)=1+a1 z⁻¹+…+ap z⁻ᵖ.
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

// Durand-Kerner: roots of the monic polynomial xⁿ + a₁xⁿ⁻¹ + … + aₙ (a indexed 1..n).
function findRoots(a: Float64Array, n: number, re: Float64Array, im: Float64Array): void {
  let cre = 1, cim = 0; const sre = 0.4, sim = 0.9; // seed₀ = (0.4+0.9i)ⁱ
  for (let i = 0; i < n; i++) {
    re[i] = cre; im[i] = cim;
    const nre = cre * sre - cim * sim, nim = cre * sim + cim * sre;
    cre = nre; cim = nim;
  }
  for (let iter = 0; iter < 60; iter++) {
    let maxd = 0;
    for (let i = 0; i < n; i++) {
      // Horner eval p(xᵢ)
      let pre = 1, pim = 0;
      for (let k = 1; k <= n; k++) {
        const nre = pre * re[i] - pim * im[i] + a[k];
        const nim = pre * im[i] + pim * re[i];
        pre = nre; pim = nim;
      }
      // denom = Π(xᵢ - xⱼ)
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

export function PoleZero({ width, height }: { width: number; height: number }) {
  const { analyserL, isPlaying, mode } = useAudio();
  const aRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aRef.current = analyserL; }, [analyserL]);
  useEffect(() => { liveRef.current = isPlaying && mode !== 'idle'; }, [isPlaying, mode]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const winRef = useRef<Float64Array>(new Float64Array(NSAMP));
  const corrRef = useRef<Float64Array>(new Float64Array(ORDER + 1));
  const reRef = useRef<Float64Array>(new Float64Array(ORDER));
  const imRef = useRef<Float64Array>(new Float64Array(ORDER));
  const frameRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr); c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
    // Hamming window
    for (let i = 0; i < NSAMP; i++) winRef.current[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (NSAMP - 1));
  }, [width, height]);

  const analyse = useCallback((live: boolean) => {
    const re = reRef.current, im = imRef.current, r = corrRef.current;
    const a = aRef.current;
    if (!live || !a) { for (let i = 0; i < ORDER; i++) { re[i] *= 0.9; im[i] *= 0.9; } return; }
    const buf = bufRef.current, win = winRef.current;
    a.getFloatTimeDomainData(buf);
    // autocorrelation of the windowed frame
    for (let lag = 0; lag <= ORDER; lag++) {
      let s = 0;
      for (let i = lag; i < NSAMP; i++) s += buf[i] * win[i] * buf[i - lag] * win[i - lag];
      r[lag] = s;
    }
    if (r[0] < 1e-6) { for (let i = 0; i < ORDER; i++) { re[i] *= 0.9; im[i] *= 0.9; } return; }
    r[0] *= 1.0001; // tiny white-noise floor for numerical stability
    const lpc = levinson(r, ORDER);
    findRoots(lpc, ORDER, re, im);
    for (let i = 0; i < ORDER; i++) {
      if (!Number.isFinite(re[i]) || !Number.isFinite(im[i])) { re[i] = 0; im[i] = 0; }
    }
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const w = width, h = height, live = liveRef.current;
    const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h - 20) / 2 - 18;

    // phosphor persistence (short pole trails)
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = live ? 'rgba(0,0,0,0.32)' : '#000';
    ctx.fillRect(0, 0, w, h);

    // graticule — unit circle, Re/Im axes, radial + 0.5 ring
    ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - R * 1.12, cy); ctx.lineTo(cx + R * 1.12, cy);
    ctx.moveTo(cx, cy - R * 1.12); ctx.lineTo(cx, cy + R * 1.12);
    ctx.stroke();
    ctx.strokeStyle = GRID_HOT; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke(); // unit circle

    // axis ticks at ±1
    ctx.fillStyle = `rgba(${CYAN},0.6)`; ctx.font = `8px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('+1', cx + R, cy + 3); ctx.fillText('−1', cx - R, cy + 3);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('Re', cx + R * 1.12 - 14, cy - 7);
    ctx.fillText('jIm', cx + 4, cy - R * 1.12 + 8);

    // poles (×) — clamp display just inside the circle if a fit goes unstable
    const re = reRef.current, im = imRef.current;
    for (let i = 0; i < ORDER; i++) {
      let pr = re[i], pi = im[i];
      const mag = Math.hypot(pr, pi);
      if (mag > 1.06) { pr /= mag / 1.02; pi /= mag / 1.02; }
      const x = cx + pr * R, y = cy - pi * R;
      const hot = mag > 0.82; // near the unit circle → strong resonance
      ctx.strokeStyle = hot ? `rgba(${CYAN},0.95)` : `rgba(${CYAN},0.5)`;
      ctx.lineWidth = 1; const s = hot ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
      ctx.stroke();
    }

    // header + legend
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${CYAN},0.7)`; ctx.font = `8px ${MONO}`;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText(`LPC ORDER ${ORDER}`, 6, 5);
    ctx.textAlign = 'right'; ctx.fillStyle = `rgba(${CYAN},0.55)`;
    ctx.fillText('× POLES', w - 6, 5);

    // magenta plot frame
    ctx.strokeStyle = FRAME; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }, [width, height]);

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

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width, height }} />;
}
