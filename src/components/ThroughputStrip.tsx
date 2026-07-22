'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { useTheme } from '@/components/ThemeProvider';
import { LIGHT_THEMES } from '@/lib/theme';

/**
 * ThroughputStrip — the broadcast as an htop-style network throughput graph
 * (reference: Screenshot 2026-07-21 234151.png). A bordered strip with a green
 * title, two traced lines over a rolling 60 s window: green = signal level
 * (L-channel RMS, the "Rx" line), red = high-frequency energy (the spikier,
 * lower "Tx" line). Current values read out in the bottom corners. Idle = the
 * lines flatline near zero. Slow sample cadence (2 Hz) so it steps like htop,
 * not a smooth scope.
 */

const N = 180;                 // samples across (× SAMPLE_MS = 60 s window)
const SAMPLE_MS = 333;
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const GREEN = '#2ea043';
const RED = '#c14a4a';

export function ThroughputStrip({ mobile = false }: { mobile?: boolean } = {}) {
  const { analyserL, analyserFreq, isPlaying, mode, carrierLost } = useAudio();
  const { name: theme } = useTheme();

  const frameRef = useRef('#5a5a5a');
  const inkRef = useRef('#111111');
  useEffect(() => {
    const light = LIGHT_THEMES.has(theme);
    frameRef.current = light ? '#8a8578' : '#4a4a4a';
    inkRef.current = light ? '#111111' : '#e8e4d9';
  }, [theme]);

  const aLRef = useRef<AnalyserNode | null>(null);
  const aFRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aLRef.current = analyserL; }, [analyserL]);
  useEffect(() => { aFRef.current = analyserFreq; }, [analyserFreq]);
  useEffect(() => {
    liveRef.current = isPlaying && mode === 'broadcast' && !carrierLost;
  }, [isPlaying, mode, carrierLost]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dims = useRef({ w: 0, h: 0, dpr: 1 });
  const tbuf = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const fbuf = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(1024));
  // history ring buffers (green = level, red = HF); accumulate the bucket max
  const gHist = useRef<Float32Array>(new Float32Array(N));
  const rHist = useRef<Float32Array>(new Float32Array(N));
  const gAcc = useRef(0);
  const rAcc = useRef(0);
  const lastSample = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(width * dpr));
      el.height = Math.max(1, Math.round(height * dpr));
      dims.current = { w: width, h: height, dpr };
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const el = canvasRef.current;
    const ctx = el?.getContext('2d');
    const { w, h, dpr } = dims.current;
    if (!ctx || w === 0 || h === 0) { rafRef.current = requestAnimationFrame(draw); return; }
    const now = performance.now();
    const live = liveRef.current;

    // ── read current level (green) + HF energy (red) ───────────────────────
    let g = 0, r = 0;
    if (live) {
      const aL = aLRef.current, aF = aFRef.current;
      if (aL) {
        if (tbuf.current.length !== aL.fftSize) tbuf.current = new Float32Array(aL.fftSize);
        aL.getFloatTimeDomainData(tbuf.current);
        let s = 0;
        for (let i = 0; i < tbuf.current.length; i++) s += tbuf.current[i] * tbuf.current[i];
        g = Math.min(1, Math.sqrt(s / tbuf.current.length) * 3.2);
      }
      if (aF) {
        if (fbuf.current.length !== aF.frequencyBinCount) fbuf.current = new Uint8Array(aF.frequencyBinCount);
        aF.getByteFrequencyData(fbuf.current);
        const nyq = aF.context.sampleRate / 2, n = fbuf.current.length;
        const a = Math.floor((4000 / nyq) * n), b = Math.min(n, Math.ceil((16000 / nyq) * n));
        let s = 0;
        for (let i = a; i < b; i++) s += fbuf.current[i];
        r = Math.min(1, (s / Math.max(1, b - a) / 255) * 2.6);
      }
    }
    gAcc.current = Math.max(gAcc.current, g);
    rAcc.current = Math.max(rAcc.current, r);

    // ── shift a new sample in every SAMPLE_MS (htop step cadence) ───────────
    if (now - lastSample.current >= SAMPLE_MS) {
      lastSample.current = now;
      gHist.current.copyWithin(0, 1);
      rHist.current.copyWithin(0, 1);
      gHist.current[N - 1] = gAcc.current;
      rHist.current[N - 1] = rAcc.current;
      gAcc.current = 0;
      rAcc.current = 0;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const fs = mobile ? 9 : 11;
    const padT = fs + 6, padB = fs + 5, padX = 4;
    const plotY = padT, plotH = h - padT - padB;
    const plotX = padX, plotW = w - padX * 2;

    // ── faint grid: dotted time divisions + level rules ────────────────────
    ctx.strokeStyle = frameRef.current;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 3]);
    ctx.beginPath();
    for (let c = 1; c < 6; c++) {
      const x = Math.round(plotX + (c / 6) * plotW) + 0.5;
      ctx.moveTo(x, plotY); ctx.lineTo(x, plotY + plotH);
    }
    for (const f of [0.25, 0.5, 0.75]) {
      const y = Math.round(plotY + f * plotH) + 0.5;
      ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // ── traced lines ───────────────────────────────────────────────────────
    const line = (hist: Float32Array, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = plotX + (i / (N - 1)) * plotW;
        const y = plotY + plotH - hist[i] * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    line(rHist.current, RED);   // red under green where they overlap
    line(gHist.current, GREEN);

    // ── frame + title ──────────────────────────────────────────────────────
    ctx.strokeStyle = frameRef.current;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.font = `${fs}px ${MONO}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = inkRef.current;
    ctx.fillText('[Throughput 60s]', 4, 3);

    // ── corner readouts ────────────────────────────────────────────────────
    const gv = gHist.current[N - 1], rv = rHist.current[N - 1];
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = GREEN;
    ctx.fillText(`Lvl ${(gv * 100).toFixed(0)}%`, 4, h - 3);
    ctx.fillStyle = RED;
    const rl = `HF ${(rv * 100).toFixed(0)}%`;
    ctx.fillText(rl, w - 4 - ctx.measureText(rl).width, h - 3);

    rafRef.current = requestAnimationFrame(draw);
  }, [mobile]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
