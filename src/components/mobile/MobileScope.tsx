'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';

/**
 * Mobile vectorscope — a chromeless "signal artifact", not an OS window.
 *
 * No grey frame, title bar or buttons: just a full-bleed black field and the raw
 * stereo vector data, rendered as an ordered-dither stipple (thermal-printer / early-
 * digital low-fi) in high-contrast cyan-white so it reads as an analog signal rather
 * than a clean vector line. Tap the field to tune in / out of the broadcast.
 *
 * Mobile-only — the shared desktop <LiveBroadcastMeter> is untouched.
 */

const SAMPLES = 2000;
// Bayer 4×4 ordered-dither matrix (0..15) → stipple threshold per pixel cell.
const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];
const GRID = 2;  // px snap grid for the stipple — small = crisp/defined
const DOT = 1;   // px dot size — fine points, not blobs

// Black trace on a white field, inside a black outline box.
const TRACE = '0,0,0';
const AXIS = 'rgba(0,0,0,0.16)';

export function MobileScope({ width, height }: { width: number; height: number }) {
  const { isPlaying, mode, broadcastPlay, pause, analyserL, analyserR } = useAudio();
  const aLRef = useRef<AnalyserNode | null>(null);
  const aRRef = useRef<AnalyserNode | null>(null);
  useEffect(() => { aLRef.current = analyserL; }, [analyserL]);
  useEffect(() => { aRRef.current = analyserR; }, [analyserR]);

  const isBroadcasting = mode === 'broadcast' && isPlaying;
  const liveRef = useRef(false);
  useEffect(() => { liveRef.current = isBroadcasting; }, [isBroadcasting]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufLRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const bufRRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const rafRef = useRef(0);

  // evenly-distributed points on a unit sphere (Fibonacci lattice) for the idle figure
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
    const c = canvasRef.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr); c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
  }, [width, height]);

  const draw = useCallback(() => {
    const c = canvasRef.current; const ctx = c?.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }
    const w = width, h = height, live = liveRef.current;
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.4;

    // clear to transparent each frame → crisp black stipple on the white field
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);

    // faint scope axes (45° L/R) — barely there, raw
    ctx.strokeStyle = AXIS; ctx.lineWidth = 1;
    const d = R * 0.96;
    ctx.beginPath();
    ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
    ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
    ctx.stroke();

    // dithered-stipple plotter shared by the live trace and the idle blob
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
      // idle signal — a 3-D sphere of dots, fixed in the centre, slowly rotating and
      // subtly shape-shifting. Depth shading (front dots darker, back sparser via the
      // dither threshold) gives it volume so a paused scope still reads as alive.
      const t = performance.now() * 0.001;
      const Rs = R * 0.22;
      const ry = t * 0.32;                 // slow spin
      const rx = 0.22 * Math.sin(t * 0.4); // gentle nod
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const cosX = Math.cos(rx), sinX = Math.sin(rx);
      const pts = sphereRef.current;
      for (let i = 0; i < pts.length; i++) {
        const [px, py, pz] = pts[i];
        // subtle radial deformation → it breathes/shape-shifts without losing the sphere
        const def = 1 + 0.06 * Math.sin(py * 4 + t * 1.2) + 0.04 * Math.sin(px * 5 - t);
        const x = px * def, y = py * def, z = pz * def;
        const x1 = x * cosY - z * sinY;       // rotate Y
        const z1 = x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX;      // rotate X
        const z2 = y * sinX + z1 * cosX;
        const amp = 0.32 + 0.68 * ((z2 + 1) / 2); // nearer dots darker/denser
        plot(cx + x1 * Rs, cy + y1 * Rs, amp);
      }
    }
    rafRef.current = requestAnimationFrame(draw);
  }, [width, height]);

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
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width, height }} />
      {/* play / pause glyph — bottom-left, reflects broadcast state */}
      <span style={{
        position: 'absolute', left: 8, bottom: 6, fontSize: 13, lineHeight: 1,
        color: '#000', pointerEvents: 'none',
      }}>
        {isBroadcasting ? '❚❚' : '▶'}
      </span>
    </div>
  );
}
