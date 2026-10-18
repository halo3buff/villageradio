'use client';

import { useEffect, useRef, useState } from 'react';
import { useAudio } from '@/lib/audio-context';

/**
 * The universal transport, pinned top-centre on every public page: the station clock (the
 * plate's UTC readout) flanked by the plate's growing-dot third-octave matrix, mirrored so low
 * frequencies hug the clock, and a play/pause so the broadcast can be stopped from anywhere.
 */

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const COLS = 16, ROWS = 3;
const DX = 7, DY = 5.5, GAP = 3.5; // column pitch, row pitch, half-gap at the centre line
const W = COLS * DX, H = Math.ceil(2 * (GAP + (ROWS - 1) * DY) + 8);
const BW = 2 ** (1 / 6); // half a third-octave

function utcClock() {
  return new Date().toISOString().slice(11, 19);
}

export function StationBar() {
  const { isPlaying, mode, analyserFreq, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const [clock, setClock] = useState<string | null>(null);
  const left = useRef<HTMLCanvasElement>(null);
  const right = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef(live);
  const freqRef = useRef(analyserFreq);
  liveRef.current = live;
  freqRef.current = analyserFreq;

  useEffect(() => {
    const tick = () => setClock(utcClock());
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let raf = 0;
    let buf = new Float32Array(0);
    const level = new Float32Array(COLS); // dots lit per column, 0..ROWS, with a slow fall
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctxs = [left.current, right.current].map((c) => {
      if (!c) return null;
      c.width = W * dpr;
      c.height = H * dpr;
      const ctx = c.getContext('2d');
      ctx?.scale(dpr, dpr);
      return ctx;
    });
    let ink = '#fff', frame = 0, lastSum = NaN, still = 0;

    const loop = () => {
      const a = freqRef.current;
      if (liveRef.current && a) {
        if (buf.length !== a.frequencyBinCount) buf = new Float32Array(a.frequencyBinCount);
        a.getFloatFrequencyData(buf);
        // A frozen spectrum means no audio is actually flowing (e.g. a suspended context):
        // let the dots fall instead of holding a stale frame.
        let sum = 0;
        for (let i = 0; i < buf.length; i += 16) sum += buf[i];
        still = sum === lastSum ? still + 1 : 0;
        lastSum = sum;
        if (still > 10) buf.fill(-Infinity);
        const hz = a.context.sampleRate / 2 / buf.length;
        for (let c = 0; c < COLS; c++) {
          const f = 20 * Math.pow(1000, c / (COLS - 1));
          const i0 = Math.max(1, Math.floor(f / BW / hz)), i1 = Math.max(i0, Math.min(buf.length - 1, Math.ceil(f * BW / hz)));
          let p = 0;
          for (let i = i0; i <= i1; i++) p += Math.pow(10, buf[i] / 10);
          // same scale as the plate: -72 dB dark, -20 dB all three dots full
          const target = Math.min(Math.max((10 * Math.log10(p || 1e-12) + 72) / 52, 0), 1) * ROWS;
          level[c] = target > level[c] ? target : Math.max(target, level[c] - 0.08);
        }
      } else {
        for (let c = 0; c < COLS; c++) level[c] = Math.max(0, level[c] - 0.08);
      }

      if (frame++ % 30 === 0 && left.current) ink = getComputedStyle(left.current).color;
      ctxs.forEach((ctx, side) => {
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = ink;
        for (let c = 0; c < COLS; c++) {
          const x = (side === 0 ? COLS - 1 - c : c) * DX + DX / 2; // low end next to the clock
          for (let r = 0; r < ROWS; r++) {
            const on = Math.min(Math.max(level[c] - r, 0), 1);
            const rad = 0.75 + on * 1.75;
            const dy = GAP + r * DY;
            // Every centre on a pixel centre: rows on half-pixels drew crisp and brighter than the rest.
            const snap = (v: number) => (Math.floor(v * dpr) + 0.5) / dpr;
            ctx.beginPath(); ctx.arc(snap(x), snap(H / 2 - dy), rad, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(snap(x), snap(H / 2 + dy), rad, 0, Math.PI * 2); ctx.fill();
          }
        }
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const canvas = (ref: React.RefObject<HTMLCanvasElement | null>) => (
    <canvas ref={ref} aria-hidden className="hidden sm:block" style={{ width: W, height: H, color: 'var(--vlg-fg, #fff)' }} />
  );

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[2100] flex items-center gap-3"
      style={{ top: 31 - H / 2, height: H, fontFamily: MONO, color: 'var(--vlg-fg, #fff)' }}
    >
      <button
        onClick={() => (live ? pause() : broadcastPlay())}
        aria-label={live ? 'Pause the station' : 'Play the station'}
        title={live ? 'Pause' : 'Play'}
        className="grid place-items-center w-[22px] h-[22px] border border-current active:scale-[0.94] transition-transform duration-100"
      >
        {live ? (
          <svg width="8" height="9" viewBox="0 0 8 9" fill="currentColor" aria-hidden>
            <rect x="0" y="0" width="2.5" height="9" />
            <rect x="5.5" y="0" width="2.5" height="9" />
          </svg>
        ) : (
          <svg width="8" height="9" viewBox="0 0 8 9" fill="currentColor" aria-hidden>
            <path d="M0 0 L8 4.5 L0 9 Z" />
          </svg>
        )}
      </button>
      {canvas(left)}
      <span className="border border-current px-2 h-[22px] leading-[20px] text-[12px] tracking-[0.08em] tabular-nums">
        {clock ?? '--:--:--'}
      </span>
      {canvas(right)}
      {/* Mirrors the button's width so the clock stays dead centre. */}
      <span aria-hidden className="w-[22px]" />
    </div>
  );
}
