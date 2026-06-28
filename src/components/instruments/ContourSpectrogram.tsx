'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { MONO, CYAN, FRAME, CONTOUR, contourColor, downsample } from './retro';

/**
 * 2-D SPECTROGRAPH (Contour) — Hypersignal-style scrolling heatmap.
 *
 * Time runs left→right, frequency bottom→top, intensity mapped through a DISCRETE
 * colour ramp (magenta / cyan / yellow / gray) with hard steps — the "−x dB/colour"
 * banding of the original. The canvas scrolls by self-blitting one step left each
 * tick (image smoothing off → crisp blocks), then paints a fresh column on the right.
 */

const STEP = 2;          // px advanced per update (also the new-column width)
const UPDATE_EVERY = 2;  // frames between columns

// reserved axis gutters (the window chrome supplies the title bar now)
const TITLE_H = 2;
const AXIS_L = 26;
const SCALE_W = 10;

export function ContourSpectrogram({ width, height }: { width: number; height: number }) {
  const { analyserFreq, isPlaying, mode } = useAudio();
  const aRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aRef.current = analyserFreq; }, [analyserFreq]);
  useEffect(() => { liveRef.current = isPlaying && mode !== 'idle'; }, [isPlaying, mode]);

  const plotRef = useRef<HTMLCanvasElement>(null);   // scrolling heatmap (1:1, blocky)
  const chromeRef = useRef<HTMLCanvasElement>(null); // static frame / labels / scale
  const freqRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(2048));
  const colRef = useRef<Float32Array>(new Float32Array(2048));
  const frameRef = useRef(0);
  const rafRef = useRef(0);

  // inner plot geometry
  const px = AXIS_L;
  const py = TITLE_H;
  const pw = Math.max(1, width - AXIS_L - SCALE_W);
  const ph = Math.max(1, height - TITLE_H);

  // static chrome: title bar, magenta frame, frequency axis, discrete colour scale
  const drawChrome = useCallback(() => {
    const c = chromeRef.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr); c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // frequency axis (vertical), kHz ticks low→high bottom→top
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${CYAN},0.55)`; ctx.font = `8px ${MONO}`;
    const ticks = ['0', '3', '6', '9', '12'];
    ticks.forEach((t, i) => {
      const y = py + ph - (i / (ticks.length - 1)) * ph;
      ctx.fillText(t, AXIS_L - 3, Math.min(py + ph - 4, Math.max(py + 5, y)));
    });
    ctx.save();
    ctx.translate(7, py + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillStyle = `rgba(${CYAN},0.45)`;
    ctx.fillText('FREQ kHz', 0, 0);
    ctx.restore();

    // discrete colour scale (right edge)
    const sx = width - SCALE_W + 2;
    for (let i = 0; i < CONTOUR.length; i++) {
      const [r, g, b] = CONTOUR[i];
      const segH = ph / CONTOUR.length;
      const y = py + ph - (i + 1) * segH;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(sx, y, SCALE_W - 4, Math.ceil(segH) + 1);
    }

    // magenta window frame
    ctx.strokeStyle = FRAME; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.strokeStyle = 'rgba(196,52,168,0.4)';
    ctx.strokeRect(px - 0.5, py - 0.5, pw + 1, ph + 1);
  }, [width, height, px, py, pw, ph]);

  // plot canvas init (1:1, no smoothing for crisp discrete cells)
  useEffect(() => {
    const c = plotRef.current; if (!c) return;
    c.width = pw; c.height = ph;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, pw, ph);
    drawChrome();
  }, [pw, ph, drawChrome]);

  const advance = useCallback((live: boolean) => {
    const c = plotRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // scroll left
    ctx.drawImage(c, -STEP, 0);

    // new column on the right
    const col = colRef.current;
    const a = aRef.current;
    if (live && a) {
      a.getByteFrequencyData(freqRef.current);
      // show the low ~12 kHz (energy-rich band) so peaks sit mid-axis, not pinned at the
      // top — still dense enough to keep the mottled FFT texture of the real display
      downsample(freqRef.current, ph, col, 0.52);
      for (let i = 0; i < ph; i++) col[i] = Math.pow(col[i], 0.8);
    } else {
      for (let i = 0; i < ph; i++) col[i] = (8 + Math.random() * 16) / 255;
    }
    const x = pw - STEP;
    for (let y = 0; y < ph; y++) {
      const v = col[ph - 1 - y]; // low freq at bottom
      const [r, g, b] = contourColor(Math.min(255, v * 255 * 1.7));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, STEP, 1);
    }
  }, [pw, ph]);

  const animate = useCallback(() => {
    if (frameRef.current % UPDATE_EVERY === 0) advance(liveRef.current);
    frameRef.current++;
    rafRef.current = requestAnimationFrame(animate);
  }, [advance]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  return (
    <>
      <canvas ref={plotRef} style={{ position: 'absolute', left: px, top: py, width: pw, height: ph }} />
      <canvas ref={chromeRef} style={{ position: 'absolute', inset: 0, width, height, pointerEvents: 'none' }} />
    </>
  );
}
