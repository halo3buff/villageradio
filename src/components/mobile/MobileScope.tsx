'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';

const SAMPLES = 2000;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const GRID = 2;
const DOT = 1;
const TRACE = '0,0,0';
const AXIS = 'rgba(0,0,0,0.16)';

export function MobileScope() {
  const { isPlaying, mode, broadcastPlay, pause, analyserL, analyserR } = useAudio();
  const aLRef = useRef<AnalyserNode | null>(null);
  const aRRef = useRef<AnalyserNode | null>(null);
  useEffect(() => { aLRef.current = analyserL; }, [analyserL]);
  useEffect(() => { aRRef.current = analyserR; }, [analyserR]);

  const isBroadcasting = mode === 'broadcast' && isPlaying;
  const liveRef = useRef(false);
  useEffect(() => { liveRef.current = isBroadcasting; }, [isBroadcasting]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimsRef = useRef({ width: 0, height: 0 });
  const bufLRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const bufRRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const rafRef = useRef(0);

  const sphereRef = useRef<[number, number, number][]>([]);
  useEffect(() => {
    const N = 900;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const pts: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * golden;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    sphereRef.current = pts;
  }, []);

  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const w = Math.round(width), h = Math.round(height);
      dimsRef.current = { width: w, height: h };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      const ctx = el.getContext('2d'); if (!ctx) return;
      ctx.scale(dpr, dpr);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current; const ctx = c?.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }
    const { width: w, height: h } = dimsRef.current;
    if (w === 0 || h === 0) { rafRef.current = requestAnimationFrame(draw); return; }
    const live = liveRef.current;
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.4;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = AXIS; ctx.lineWidth = 1;
    const d = R * 0.96;
    ctx.beginPath();
    ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
    ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
    ctx.stroke();

    const plot = (x: number, y: number, amp: number) => {
      const gx = Math.round(x / GRID), gy = Math.round(y / GRID);
      const thresh = BAYER[(gy & 3) * 4 + (gx & 3)] / 16;
      if (amp < thresh * 0.4) return;
      ctx.fillStyle = `rgba(${TRACE},1)`;
      ctx.fillRect(gx * GRID, gy * GRID, DOT, DOT);
    };

    ctx.globalCompositeOperation = 'source-over';
    const aL = aLRef.current, aR = aRRef.current;
    if (live && aL && aR) {
      const bufL = bufLRef.current, bufR = bufRRef.current;
      aL.getFloatTimeDomainData(bufL);
      aR.getFloatTimeDomainData(bufR);
      const stride = Math.max(1, Math.floor(bufL.length / SAMPLES));
      for (let i = 0; i < SAMPLES; i++) {
        const idx = i * stride;
        const l = bufL[idx], r = bufR[idx];
        const x = cx + (r - l) * R;
        const y = cy - (l + r) * R;
        const amp = Math.min(1, Math.hypot(l, r) * 1.4);
        plot(x, y, amp);
      }
    } else {
      const t = performance.now() * 0.001;
      const Rs = R * 0.22;
      const ry = t * 0.32;
      const rx = 0.22 * Math.sin(t * 0.4);
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const cosX = Math.cos(rx), sinX = Math.sin(rx);
      const pts = sphereRef.current;
      for (let i = 0; i < pts.length; i++) {
        const [px, py, pz] = pts[i];
        const def = 1 + 0.06 * Math.sin(py * 4 + t * 1.2) + 0.04 * Math.sin(px * 5 - t);
        const x = px * def, y = py * def, z = pz * def;
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        const amp = 0.32 + 0.68 * ((z2 + 1) / 2);
        plot(cx + x1 * Rs, cy + y1 * Rs, amp);
      }
    }
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  const onTap = () => {
    if (isBroadcasting) pause(); else broadcastPlay();
  };

  return (
    <div onClick={onTap} style={{
      position: 'absolute', inset: 0, background: 'transparent',
      border: '1px solid #000', boxSizing: 'border-box', cursor: 'pointer',
    }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <span style={{ position: 'absolute', left: 8, bottom: 6, pointerEvents: 'none', lineHeight: 1 }}>
        {isBroadcasting ? (
          <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
            <rect x="0" y="0" width="3" height="12" fill="#000" />
            <rect x="6" y="0" width="3" height="12" fill="#000" />
          </svg>
        ) : (
          <svg width="9" height="12" viewBox="0 0 9 12" aria-hidden>
            <polygon points="0,0 0,12 9,6" fill="#000" />
          </svg>
        )}
      </span>
    </div>
  );
}
