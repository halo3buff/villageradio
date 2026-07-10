'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { MONO } from '@/components/instruments/retro';

const NSAMP = 512;

/** White-background waveform oscilloscope for the listen page Q4 slot.
 *  Reads float32 time-domain data and draws a triggered sweep — works
 *  with both the live broadcast and archive playback. */
export function ListenOscilloscope() {
  const { analyserL, isPlaying, mode } = useAudio();
  const aRef    = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aRef.current = analyserL; }, [analyserL]);
  useEffect(() => { liveRef.current = isPlaying && mode !== 'idle'; }, [isPlaying, mode]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimsRef   = useRef({ width: 0, height: 0 });
  const bufRef    = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const traceRef  = useRef<Float32Array<ArrayBuffer>>(new Float32Array(NSAMP));
  const smoothRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(NSAMP));
  const rafRef    = useRef(0);
  const frameRef  = useRef(0);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const w = Math.round(width), h = Math.round(height);
      dimsRef.current = { width: w, height: h };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const capture = useCallback(() => {
    const a = aRef.current;
    const live = liveRef.current;
    const buf = bufRef.current;
    const trace = traceRef.current;
    const smooth = smoothRef.current;

    if (!live || !a) {
      // Decay to flat line when idle
      for (let i = 0; i < NSAMP; i++) smooth[i] *= 0.88;
      return;
    }

    a.getFloatTimeDomainData(buf);

    // Zero-crossing trigger: find first rising zero-cross in middle third
    let start = Math.floor(buf.length / 3);
    const end  = Math.floor(buf.length * 2 / 3);
    for (let i = start; i < end - 1; i++) {
      if (buf[i] <= 0 && buf[i + 1] > 0) { start = i; break; }
    }

    for (let i = 0; i < NSAMP; i++) {
      trace[i] = i + start < buf.length ? buf[i + start] : 0;
    }

    // Temporal smoothing — prevents jitter when signal is stable
    const α = 0.35;
    for (let i = 0; i < NSAMP; i++) {
      smooth[i] = smooth[i] * (1 - α) + trace[i] * α;
    }
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = dimsRef.current;
    if (w === 0 || h === 0) return;

    const live = liveRef.current;
    const ML = 14, MR = 8, MT = 14, MB = 14;
    const pw = w - ML - MR;
    const ph = h - MT - MB;
    const cy = MT + ph / 2;

    // Background — slight trail when live for phosphor feel
    ctx.fillStyle = live ? 'rgba(255,255,255,0.45)' : '#fff';
    ctx.fillRect(0, 0, w, h);

    // Grid — 4 horizontal divisions, 6 vertical
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = MT + (i / 4) * ph;
      ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + pw, y); ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const x = ML + (i / 6) * pw;
      ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + ph); ctx.stroke();
    }

    // Zero line
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ML, cy); ctx.lineTo(ML + pw, cy); ctx.stroke();

    // Waveform trace
    const smooth = smoothRef.current;
    ctx.strokeStyle = live ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < NSAMP; i++) {
      const x = ML + (i / (NSAMP - 1)) * pw;
      const y = cy - smooth[i] * (ph / 2) * 0.85;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = `7px ${MONO}`;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText('+1', ML, MT + 1);
    ctx.textBaseline = 'bottom';
    ctx.fillText('−1', ML, MT + ph - 1);
    ctx.textBaseline = 'top'; ctx.textAlign = 'right';
    ctx.fillText(`${NSAMP} SAMP`, w - MR, MT);
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'right';
    ctx.fillText('WAVEFORM', w - MR, h - 1);
    ctx.textAlign = 'left';
    ctx.fillText('0', ML, h - 1);
  }, []);

  const animate = useCallback(() => {
    if (frameRef.current % 2 === 0) capture();
    frameRef.current++;
    draw();
    rafRef.current = requestAnimationFrame(animate);
  }, [capture, draw]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}
