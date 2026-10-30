'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAudio } from '@/lib/audio-context';
import { secondsIntoDay } from '@/lib/content/broadcast';
import { VISUAL_TRIM_DB } from '@/lib/audio/loudness';

/**
 * The universal transport, pinned top-centre on every public page: the station clock (the
 * broadcast day's Eastern time, as the admin timeline uses) set in a balance tape, as a thermal
 * sight's heading tape: L on the far left, R on the far right, the clock the centre, a caret
 * under the tape where the stereo image leans and each channel's level as five pips beneath its
 * half. And a play/pause so the broadcast can be stopped from anywhere.
 */

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const W = 112, H = 37;   // each half of the tape
const END = 10;          // room for the L / R at the tape's outer end
const TAPE_Y = 14, PIPS_Y = 27;

/** The broadcast day's clock (Eastern) — the same time the admin timeline schedules against. */
export function stationClock() {
  const s = Math.floor(secondsIntoDay(Date.now()));
  return [s / 3600, (s / 60) % 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, '0')).join(':');
}

export function StationBar() {
  const { isPlaying, mode, analyserL, analyserR, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const home = usePathname() === '/station';   // the station's own header carries the clock
  const [clock, setClock] = useState<string | null>(null);
  const left = useRef<HTMLCanvasElement>(null);
  const right = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef(live);
  const chRef = useRef([analyserL, analyserR]);
  liveRef.current = live;
  chRef.current = [analyserL, analyserR];

  useEffect(() => {
    const tick = () => setClock(stationClock());
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let raf = 0;
    let buf = new Float32Array(0);
    const lvl = [0, 0];   // each channel's level, 0..1, rising fast and falling slow
    let bal = 0;          // -1 hard left .. 1 hard right
    let lastSum = NaN, still = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctxs = [left.current, right.current].map((c) => {
      if (!c) return null;
      c.width = W * dpr;
      c.height = H * dpr;
      const ctx = c.getContext('2d');
      ctx?.scale(dpr, dpr);
      return ctx;
    });
    let ink = '#fff', face = 'monospace', frame = 0;
    const snap = (v: number) => (Math.floor(v * dpr) + 0.5) / dpr;   // hairlines on the pixel grid

    const loop = () => {
      const [aL, aR] = chRef.current;
      const rms = [0, 0];
      if (liveRef.current && aL && aR) {
        [aL, aR].forEach((a, ch) => {
          if (buf.length !== a.fftSize) buf = new Float32Array(a.fftSize);
          a.getFloatTimeDomainData(buf);
          let e = 0;
          for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
          rms[ch] = Math.sqrt(e / buf.length);
        });
        // a frozen signal means no audio is actually flowing (e.g. a suspended context): let it all fall
        const sum = rms[0] + rms[1];
        still = sum === lastSum ? still + 1 : 0;
        lastSum = sum;
        if (still > 10) rms[0] = rms[1] = 0;
      }
      rms.forEach((r, ch) => {
        // -40 dB dark, -10 dB all five pips, on the plate's visual trim
        const target = Math.min(Math.max((20 * Math.log10(r || 1e-9) + VISUAL_TRIM_DB + 40) / 30, 0), 1);
        lvl[ch] = target > lvl[ch] ? target : Math.max(target, lvl[ch] - 0.02);
      });
      const tb = rms[0] + rms[1] > 1e-5 ? (rms[1] - rms[0]) / (rms[0] + rms[1]) : 0;
      bal += (tb - bal) * 0.15;

      if (frame++ % 30 === 0 && left.current) {
        const cs = getComputedStyle(left.current);
        ink = cs.color; face = cs.fontFamily;
      }
      ctxs.forEach((ctx, side) => {
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);
        ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1;
        // the half's tape: from the outer end (L or R) to the clock
        const x0 = side === 0 ? END : 2, x1 = side === 0 ? W - 2 : W - END;
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(x0, snap(TAPE_Y)); ctx.lineTo(x1, snap(TAPE_Y)); ctx.stroke();
        for (let i = 0; i <= 10; i++) {
          const x = snap(x0 + ((x1 - x0) * i) / 10);
          const h = i % 5 ? 2 : 4;
          ctx.beginPath(); ctx.moveTo(x, TAPE_Y); ctx.lineTo(x, TAPE_Y - h); ctx.stroke();
        }
        ctx.font = `600 7px ${face}`; ctx.textBaseline = 'middle';
        ctx.textAlign = side === 0 ? 'left' : 'right';
        ctx.fillText(side === 0 ? 'L' : 'R', side === 0 ? 1 : W - 1, TAPE_Y - 1);
        // the caret, under whichever half the balance falls in (both inner ends when centred)
        const inner = side === 0 ? x1 : x0;
        const caret = Math.abs(bal) < 0.02 ? inner
          : side === 0 && bal < 0 ? x1 + bal * (x1 - x0)
          : side === 1 && bal > 0 ? x0 + bal * (x1 - x0) : null;
        ctx.globalAlpha = 1;
        if (caret != null) {
          ctx.beginPath(); ctx.moveTo(caret, TAPE_Y + 2); ctx.lineTo(caret - 2.5, TAPE_Y + 6); ctx.lineTo(caret + 2.5, TAPE_Y + 6); ctx.fill();
        }
        // five pips, lit from the clock outward with this half's channel
        const lit = Math.round(lvl[side] * 5);
        for (let i = 0; i < 5; i++) {
          const x = snap(inner + (side === 0 ? -1 : 1) * (12 + i * 9)), y = snap(PIPS_Y);
          ctx.globalAlpha = i < lit ? 1 : 0.3;
          ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const canvas = (ref: React.RefObject<HTMLCanvasElement | null>) => (
    <canvas ref={ref} aria-hidden className="hidden sm:block" style={{ width: W, height: H, color: 'var(--vlg-fg, #fff)', fontFamily: MONO }} />
  );

  return (
    <div
      className="station-bar fixed left-1/2 -translate-x-1/2 z-[2100] flex items-center gap-3"
      style={{ top: 31 - H / 2, height: H, fontFamily: MONO, color: 'var(--vlg-fg, #fff)' }}
    >
      <button
        onClick={() => (live ? pause() : broadcastPlay())}
        aria-label={live ? 'Pause the station' : 'Play the station'}
        title={live ? 'Pause' : 'Play'}
        className="grid place-items-center w-[28px] h-[28px] sm:w-[22px] sm:h-[22px] border border-current active:scale-[0.94] transition-transform duration-100"
      >
        {live ? (
          <svg viewBox="0 0 8 9" fill="currentColor" aria-hidden className="w-[10px] h-[11px] sm:w-[8px] sm:h-[9px]">
            <rect x="0" y="0" width="2.5" height="9" />
            <rect x="5.5" y="0" width="2.5" height="9" />
          </svg>
        ) : (
          <svg viewBox="0 0 8 9" fill="currentColor" aria-hidden className="w-[10px] h-[11px] sm:w-[8px] sm:h-[9px]">
            <path d="M0 0 L8 4.5 L0 9 Z" />
          </svg>
        )}
      </button>
      {canvas(left)}
      {!home && <span className="border border-current h-[28px] leading-[26px] text-[14px] w-[102px] sm:h-[22px] sm:leading-[20px] sm:text-[12px] sm:w-[88px] text-center tracking-[0.08em] tabular-nums">
        {clock ?? '--:--:--'}
      </span>}
      {canvas(right)}
      {/* Mirrors the button's width so the clock stays dead centre. Both a touch bigger on phones. */}
      <span aria-hidden className="w-[28px] sm:w-[22px]" />
    </div>
  );
}
