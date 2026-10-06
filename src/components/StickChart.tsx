'use client';

import { useEffect, useRef } from 'react';
import { useAudio } from '@/lib/audio-context';

const FONT = "var(--font-vt323), 'Courier New', monospace";

function bandAvg(buf: Uint8Array, sr: number, lo: number, hi: number): number {
  const nyq = sr / 2, n = buf.length;
  const a = Math.max(0, Math.floor((lo / nyq) * n));
  const b = Math.min(n, Math.max(a + 1, Math.ceil((hi / nyq) * n)));
  let s = 0;
  for (let i = a; i < b; i++) s += buf[i];
  return s / (b - a) / 255;
}

/**
 * A live oceanographic-style "stick plot": vertical spikes rising north/south
 * from a centre zero line, with a smoothed running-average trend line over
 * them. Each time column is the band energy's deviation from its slow mean,
 * auto-gained so the plot always fills the panel (as in the reference) whatever
 * the volume. History scrolls right→left. Idle = a calm, gently rolling sea.
 * Code-drawn on <canvas>; ink follows the `--vlg-fg` theme var.
 */
export function StickChart({
  lo, hi, label, width = 300, height = 96,
}: { lo: number; hi: number; label: string; width?: number; height?: number }) {
  const { analyserFreq, isPlaying, mode, carrierLost } = useAudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aRef.current = analyserFreq; }, [analyserFreq]);
  useEffect(() => {
    liveRef.current = isPlaying && mode === 'broadcast' && !carrierLost;
  }, [isPlaying, mode, carrierLost]);

  const COLS = Math.floor(width / 2);   // one stick every 2px
  const sticks = useRef<Float32Array>(new Float32Array(COLS));   // normalised −1..1
  const trend = useRef<Float32Array>(new Float32Array(COLS));
  const mean = useRef(-1);              // −1 = "unseeded"
  const norm = useRef(0.05);            // decaying peak-abs for auto-gain
  const tv = useRef(0);
  const buf = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(1024));
  const raf = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = width * dpr; cv.height = height * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const y0 = height / 2;
    const amp = y0 * 0.9;

    const tick = () => {
      const t = performance.now() * 0.001;
      const live = liveRef.current;
      const a = aRef.current;

      let nv: number;   // normalised stick value, −1..1
      if (live && a) {
        if (buf.current.length !== a.frequencyBinCount) buf.current = new Uint8Array(a.frequencyBinCount);
        a.getByteFrequencyData(buf.current);
        const e = bandAvg(buf.current, a.context.sampleRate, lo, hi);
        if (mean.current < 0) mean.current = e;            // seed → no start-up ramp
        mean.current += (e - mean.current) * 0.05;
        const dev = e - mean.current;
        norm.current = Math.max(Math.abs(dev), norm.current * 0.992, 0.01);
        nv = dev / norm.current;                            // auto-gain to fill panel
      } else {
        // calm rolling sea
        mean.current = -1; norm.current = 0.05;
        nv = 0.18 * Math.sin(t * 1.1 + lo) + 0.08 * Math.sin(t * 2.7 + hi * 0.001);
      }
      tv.current += (nv - tv.current) * 0.06;

      if (frame.current % 2 === 0) {
        sticks.current.copyWithin(0, 1);
        trend.current.copyWithin(0, 1);
        sticks.current[COLS - 1] = nv;
        trend.current[COLS - 1] = tv.current;
      }

      // ── draw ──────────────────────────────────────────────────────────────
      const ink = getComputedStyle(cv).getPropertyValue('--vlg-fg').trim() || '#2a2ac0';
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y0 + 0.5); ctx.lineTo(width, y0 + 0.5); ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      for (let c = 0; c < COLS; c++) {
        const x = c * 2 + 0.5;
        const v = Math.max(-amp, Math.min(amp, sticks.current[c] * amp));
        ctx.moveTo(x, y0); ctx.lineTo(x, y0 - v);
      }
      ctx.stroke();

      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let c = 0; c < COLS; c++) {
        const x = c * 2 + 0.5;
        const v = Math.max(-amp, Math.min(amp, trend.current[c] * amp * 0.5));
        if (c === 0) ctx.moveTo(x, y0 - v); else ctx.lineTo(x, y0 - v);
      }
      ctx.stroke();

      frame.current++;
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [COLS, width, height, lo, hi]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas ref={canvasRef} style={{ width, height, display: 'block' }} />
      <span style={{
        position: 'absolute', top: 1, left: 3, fontFamily: FONT, fontSize: 13,
        lineHeight: 1, color: 'var(--vlg-fg, #2a2ac0)', pointerEvents: 'none',
      }}>{label}</span>
      <span style={{
        position: 'absolute', top: 2, right: 3, fontFamily: FONT, fontSize: 10,
        lineHeight: 1, color: 'var(--vlg-fg, #2a2ac0)', opacity: 0.65, pointerEvents: 'none',
      }}>N</span>
      <span style={{
        position: 'absolute', bottom: 2, right: 3, fontFamily: FONT, fontSize: 10,
        lineHeight: 1, color: 'var(--vlg-fg, #2a2ac0)', opacity: 0.65, pointerEvents: 'none',
      }}>S</span>
    </div>
  );
}
