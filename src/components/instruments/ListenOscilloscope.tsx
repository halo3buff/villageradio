'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { useTheme } from '@/components/ThemeProvider';
import { LIGHT_THEMES } from '@/lib/theme';
import { dspPalette, initRetroCanvas, pixelFont, stackLabel, watermark } from './retro';

const NSAMP = 512;

/**
 * Hypersignal "Wave Display" — dual stacked L/R traces, magenta plot frame,
 * dotted vertical gridlines, stacked AMPLITUDE / AD UNITS axis labels, 16-bit
 * extents, FRAME POSITION readout, a drifting region-select rectangle and the
 * stats box. Yellow-on-black on the dark theme, black-on-white on default.
 */
export function ListenOscilloscope() {
  const { analyserL, analyserR, isPlaying, mode } = useAudio();
  const { name: theme } = useTheme();
  const lightRef = useRef(true);
  useEffect(() => { lightRef.current = LIGHT_THEMES.has(theme); }, [theme]);

  const aLRef = useRef<AnalyserNode | null>(null);
  const aRRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aLRef.current = analyserL; }, [analyserL]);
  useEffect(() => { aRRef.current = analyserR; }, [analyserR]);
  useEffect(() => { liveRef.current = isPlaying && mode !== 'idle'; }, [isPlaying, mode]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimsRef   = useRef({ width: 0, height: 0 });
  const bufRef    = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const smoothL   = useRef<Float32Array<ArrayBuffer>>(new Float32Array(NSAMP));
  const smoothR   = useRef<Float32Array<ArrayBuffer>>(new Float32Array(NSAMP));
  const rafRef    = useRef(0);
  const frameRef  = useRef(0);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      dimsRef.current = { width: Math.round(width), height: Math.round(height) };
      initRetroCanvas(el, width, height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const capture = useCallback((a: AnalyserNode | null, smooth: Float32Array) => {
    if (!liveRef.current || !a) {
      for (let i = 0; i < NSAMP; i++) smooth[i] *= 0.88;
      return;
    }
    const buf = bufRef.current;
    a.getFloatTimeDomainData(buf);
    // zero-crossing trigger in the middle third
    let start = Math.floor(buf.length / 3);
    const end = Math.floor(buf.length * 2 / 3);
    for (let i = start; i < end - 1; i++) {
      if (buf[i] <= 0 && buf[i + 1] > 0) { start = i; break; }
    }
    const α = 0.35;
    for (let i = 0; i < NSAMP; i++) {
      const v = i + start < buf.length ? buf[i + start] : 0;
      smooth[i] = smooth[i] * (1 - α) + v * α;
    }
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = dimsRef.current;
    if (w === 0 || h === 0) return;
    const P = dspPalette(lightRef.current);
    const live = liveRef.current;

    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    const ML = 34, MR = 10, MT = 16, MB = 30;
    const pw = w - ML - MR;
    const ph = h - MT - MB;

    // ── plot frame (magenta) + mid divider between the two traces
    ctx.strokeStyle = P.frame;
    ctx.lineWidth = 1;
    ctx.strokeRect(ML - 0.5, MT - 0.5, pw + 1, ph + 1);
    const midY = Math.round(MT + ph / 2);
    ctx.beginPath(); ctx.moveTo(ML, midY + 0.5); ctx.lineTo(ML + pw, midY + 0.5); ctx.stroke();

    // dotted vertical gridlines (8 divisions)
    ctx.strokeStyle = P.frameDim;
    for (let i = 1; i < 8; i++) {
      const x = Math.round(ML + (i / 8) * pw) + 0.5;
      for (let y = MT + 2; y < MT + ph - 2; y += 4) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 1); ctx.stroke();
      }
    }

    // ── the two traces
    const panels: [Float32Array, number][] = [
      [smoothL.current, MT + ph * 0.25],
      [smoothR.current, MT + ph * 0.75],
    ];
    const amp = (ph / 4) * 0.88;
    for (const [smooth, cy] of panels) {
      // zero line
      ctx.strokeStyle = P.labelDim;
      ctx.beginPath(); ctx.moveTo(ML, Math.round(cy) + 0.5); ctx.lineTo(ML + pw, Math.round(cy) + 0.5); ctx.stroke();
      ctx.strokeStyle = live ? P.yellow : P.labelDim;
      ctx.beginPath();
      for (let i = 0; i < NSAMP; i++) {
        const x = ML + (i / (NSAMP - 1)) * pw;
        const y = cy - smooth[i] * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ── drifting region-select rectangle (the white frame cursor of the original)
    const t = performance.now() * 0.001;
    const selW = pw * 0.18;
    const selX = ML + ((t * 14) % (pw - selW));
    ctx.strokeStyle = P.select;
    ctx.strokeRect(Math.round(selX) + 0.5, MT + 1.5, Math.round(selW), ph - 3);

    // ── labels
    ctx.fillStyle = P.label;
    ctx.font = pixelFont(10);

    // 16-bit extents
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('32767', 1, MT - 1);
    ctx.textBaseline = 'bottom';
    ctx.fillText('-32768', 1, MT + ph + 1);

    // stacked axis labels
    ctx.fillStyle = P.labelDim;
    stackLabel(ctx, 'AMPLITUDE', 8, MT + 14, 9);
    stackLabel(ctx, 'AD UNITS', 20, MT + 26, 9);

    // header: watermark + frame position
    watermark(ctx, ML + 62, MT - 4, lightRef.current ? P.watermark : P.yellow, 'left', 11);
    ctx.fillStyle = P.label;
    ctx.font = pixelFont(10);
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`FRAME POSITION: ${(selX / pw).toFixed(3).replace(/^0/, '')}`, w - MR, MT - 2);

    // ── stats box
    const sbY = MT + ph + 4;
    ctx.strokeStyle = P.frame;
    ctx.strokeRect(ML - 0.5, sbY + 0.5, pw + 1, MB - 8);
    ctx.fillStyle = P.label;
    ctx.font = pixelFont(9);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`File1: broadcast   L: ${live ? (t % 60).toFixed(3) : '0.000'} S`, ML + 4, sbY + 3);
    ctx.fillText('Fs: 48.000 kHz, Win: Hamm', ML + 4, sbY + 12);
    ctx.textAlign = 'right';
    ctx.fillText(`FFT Length: ${NSAMP * 4}`, ML + pw - 4, sbY + 3);
    ctx.fillText(`Framesize: ${NSAMP}`, ML + pw - 4, sbY + 12);
  }, []);

  const animate = useCallback(() => {
    if (frameRef.current % 2 === 0) {
      capture(aLRef.current, smoothL.current);
      capture(aRRef.current, smoothR.current);
    }
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
