'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { useTheme } from '@/components/ThemeProvider';
import { LIGHT_THEMES } from '@/lib/theme';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));   // golden angle, for the idle sphere lattice

/**
 * LcdPanel — the broadcast vectorscope. Theme-aware ink on the site background.
 * Live = the stereo goniometer trace, each L/R sample a dot. Idle = a
 * still 3-D dot sphere whose radius subtly shape-shifts (depth → alpha).
 * One rAF loop, no React re-renders.
 */
export function LcdPanel({ mobile = false }: { mobile?: boolean } = {}) {
  const { analyserL, analyserR, isPlaying, mode, carrierLost } = useAudio();
  const { name: theme } = useTheme();

  const inkRef = useRef('#141414');
  useEffect(() => { inkRef.current = LIGHT_THEMES.has(theme) ? '#141414' : '#dfe8ee'; }, [theme]);

  const aLRef = useRef<AnalyserNode | null>(null);
  const aRRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aLRef.current = analyserL; }, [analyserL]);
  useEffect(() => { aRRef.current = analyserR; }, [analyserR]);
  useEffect(() => {
    liveRef.current = isPlaying && mode === 'broadcast' && !carrierLost;
  }, [isPlaying, mode, carrierLost]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dims = useRef({ w: 0, h: 0, dpr: 1 });
  const bufL = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const bufR = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const rafRef = useRef(0);

  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(width * dpr));
      el.height = Math.max(1, Math.round(height * dpr));
      dims.current = { w: width, h: height, dpr };
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const el = canvasRef.current; const ctx = el?.getContext('2d');
    const { w, h, dpr } = dims.current;
    if (!ctx || w === 0) { rafRef.current = requestAnimationFrame(draw); return; }
    const t = performance.now() * 0.001;
    const live = liveRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = inkRef.current;

    const dotPx = mobile ? 1 : 1.5;
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.42;

    const aL = aLRef.current, aR = aRRef.current;
    if (live && aL && aR) {
      if (bufL.current.length !== aL.fftSize) bufL.current = new Float32Array(aL.fftSize);
      if (bufR.current.length !== aR.fftSize) bufR.current = new Float32Array(aR.fftSize);
      aL.getFloatTimeDomainData(bufL.current);
      aR.getFloatTimeDomainData(bufR.current);
      const N = mobile ? 500 : 900;
      const g = R * 0.9;
      const stride = Math.max(1, Math.floor(bufL.current.length / N));
      for (let i = 0; i < N; i++) {
        const l = bufL.current[i * stride], r = bufR.current[i * stride];
        ctx.fillRect(Math.round(cx + (r - l) * g), Math.round(cy - (l + r) * g), dotPx, dotPx);
      }
    } else {
      // idle: a still 3-D dot sphere (fibonacci lattice) deformed by three
      // localized bumps whose poles drift slowly around the sphere — the swells
      // travel across the surface like a liquid blob. No rotation. Depth = alpha.
      const N = mobile ? 550 : 1000;
      const r = R * 0.4;
      // drifting bump poles (unit vectors on slow wandering paths)
      const poles: [number, number, number][] = [];
      for (let p = 0; p < 3; p++) {
        const a = t * (0.3 + p * 0.1) + p * 2.1;
        const b = t * (0.21 + p * 0.09) + p * 4.2;
        const cb = Math.cos(b);
        poles.push([cb * Math.cos(a), Math.sin(b), cb * Math.sin(a)]);
      }
      const breathe = 1 + 0.05 * Math.sin(t * 0.7);
      for (let k = 0; k < N; k++) {
        const phi = Math.acos(1 - (2 * (k + 0.5)) / N);
        const th = k * GOLDEN;
        const sp = Math.sin(phi);
        const x = sp * Math.cos(th), y = Math.cos(phi), z = sp * Math.sin(th);
        // localized swells: exp falloff around each drifting pole
        let d = breathe;
        for (let p = 0; p < 3; p++) {
          const dot = x * poles[p][0] + y * poles[p][1] + z * poles[p][2];
          d += 0.34 * Math.exp(3.5 * (dot - 1));
        }
        ctx.globalAlpha = 0.2 + 0.7 * (z * d / 1.25 + 1) / 2;
        ctx.fillRect(
          Math.round(cx + x * d * r),
          Math.round(cy + y * d * r),
          dotPx, dotPx,
        );
      }
      ctx.globalAlpha = 1;
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [mobile]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      border: '1px solid var(--vlg-fg, #111)',
      background: 'var(--vlg-bg, #ffffff)',
    }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}
