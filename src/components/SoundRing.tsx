'use client';

import { useEffect, useRef } from 'react';
import { useAudio } from '@/lib/audio-context';

const BANDS = 48;        // log-spaced, 40 Hz – 14 kHz
const POINTS = 220;      // dots round the ring
const RIPPLE_S = 2.4;    // a ripple's life, seconds

/**
 * The recording visual: the station's mark, glowing as on the homepage, on the station's photo, with
 * a ring of light round it shaped by the music (bass at the top, highs down both sides) and, on each
 * beat, a ripple that leaves the ring in its shape and spreads out, fading. Fills its parent; a tap
 * tunes in.
 */
export function SoundRing() {
  const { analyserFreq, isPlaying, mode, carrierLost, broadcastPlay } = useAudio();
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ analyser: analyserFreq, on: false });
  live.current = { analyser: analyserFreq, on: isPlaying && mode === 'broadcast' && !carrierLost };

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let freq = new Uint8Array(1024);
    const level = new Float32Array(BANDS);
    const hiMark = new Float32Array(BANDS).fill(60);
    const loMark = new Float32Array(BANDS).fill(255);
    const shape = new Float32Array(POINTS);   // the ring's push outward at each point, 0..1
    let bassAvg = 0, bassPrev = 0, lastBeat = 0;
    const ripples: { born: number; shape: Float32Array; strength: number }[] = [];

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const S = Math.min(cv.width, cv.height), cx = cv.width / 2, cy = cv.height / 2;
      const R0 = S * 0.29, AMP = S * 0.07;
      const t = now / 1000;
      const { analyser, on } = live.current;

      // ── the music: each band against its own recent range, so all of it moves with the beat ──
      let bass = 0;
      if (on && analyser) {
        if (freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freq);
        const nyq = analyser.context.sampleRate / 2;
        for (let i = 0; i < BANDS; i++) {
          const lo = Math.floor((40 * Math.pow(350, i / BANDS)) / nyq * freq.length);
          const hi = Math.max(lo + 1, Math.floor((40 * Math.pow(350, (i + 1) / BANDS)) / nyq * freq.length));
          let m = 0;
          for (let k = lo; k < hi; k++) m = Math.max(m, freq[k]);
          hiMark[i] = Math.max(m, hiMark[i] * 0.997);
          loMark[i] = Math.min(m, loMark[i] + 0.15);
          const v = Math.pow(Math.max(0, m - loMark[i]) / (hiMark[i] - loMark[i] + 12), 2);
          level[i] = v > level[i] ? level[i] + (v - level[i]) * 0.6 : level[i] * 0.9;
        }
        // the kick, raw: the sub/low bins' mean, 0..1 (the bands above are normalised, so they can't show a jump)
        const kHi = Math.max(2, Math.round(150 / nyq * freq.length));
        for (let k = 1; k < kHi; k++) bass += freq[k];
        bass /= (kHi - 1) * 255;
      } else {
        for (let i = 0; i < BANDS; i++) level[i] = 0.12 + 0.1 * Math.sin(t * 0.9 - i * 0.25) ** 2;
      }

      // ring shape: bass at the top, mirrored down both sides, smoothed between bands
      for (let p = 0; p < POINTS; p++) {
        const a = Math.abs(((p / POINTS) * 2 - 1));   // 1 at the top, 0 at the bottom
        const f = (1 - a) * (BANDS - 1);
        const i = Math.floor(f), u = f - i;
        const v = level[i] * (1 - u) + level[Math.min(BANDS - 1, i + 1)] * u;
        shape[p] += (v - shape[p]) * 0.5;
      }

      // a beat: the kick jumps past its running average and is still rising (or, off air, a slow pulse)
      const rising = bass - bassPrev > 0.01;
      bassPrev = bass;
      bassAvg += (bass - bassAvg) * 0.03;
      const beat = on ? rising && bass > bassAvg * 1.04 && now - lastBeat > 280 : now - lastBeat > 3200;
      if (beat) {
        lastBeat = now;
        ripples.push({ born: now, shape: shape.slice(), strength: on ? Math.min(1, 0.3 + (bass - bassAvg) * 8) : 0.35 });
        if (ripples.length > 14) ripples.shift();
      }

      // ── paint: white light with the logo's own glow ──────────────────────
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(255,255,255,0.6)';
      const at = (p: number, r: number) => {
        const th = (p / POINTS) * Math.PI * 2 - Math.PI / 2;   // from the top, clockwise
        return [cx + Math.cos(th) * r, cy + Math.sin(th) * r];
      };

      // ripples: the ring's shape at the beat, spreading out and fading
      for (let k = ripples.length - 1; k >= 0; k--) {
        const r = ripples[k];
        const age = (now - r.born) / 1000 / RIPPLE_S;
        if (age >= 1) { ripples.splice(k, 1); continue; }
        const grow = 1 - Math.pow(1 - age, 2.2);   // fast out, easing
        ctx.globalAlpha = r.strength * Math.pow(1 - age, 1.6) * 0.8;
        ctx.lineWidth = Math.max(1, S * 0.0022);
        ctx.shadowBlur = S * 0.012;
        ctx.beginPath();
        for (let p = 0; p <= POINTS; p++) {
          const q = p % POINTS;
          const [x, y] = at(q, R0 + r.shape[q] * AMP * (1 - grow * 0.6) + grow * S * 0.42);
          if (p) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }

      // the ring itself: dots of light, like the station's figure
      ctx.globalAlpha = 1;
      ctx.shadowBlur = S * 0.01;
      const dot = Math.max(1, S * 0.0032);
      ctx.beginPath();
      for (let p = 0; p < POINTS; p++) {
        const [x, y] = at(p, R0 + shape[p] * AMP);
        ctx.moveTo(x + dot, y);
        ctx.arc(x, y, dot, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div onClick={() => { if (!live.current.on) broadcastPlay(); }}
      style={{ position: 'relative', width: '100%', height: '100%', containerType: 'size', overflow: 'hidden', cursor: 'pointer',
        background: 'var(--vlg-cover, #575a5f)', backgroundAttachment: 'scroll' }}>
      {/* the homepage's mark, as it is there */}
      {/* eslint-disable-next-line @next/next/no-img-element -- animated, served as is */}
      <img src="/site_assets/logo_roto_v4.webp" alt="Village Radio" style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: '54cqmin', aspectRatio: '230 / 205', objectFit: 'contain', filter: 'var(--logo-filter)', pointerEvents: 'none',
      }} />
      <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
    </div>
  );
}
