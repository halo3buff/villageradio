'use client';

import { useEffect, useRef } from 'react';
import { BIN, status, type SignalFeed } from '@/lib/radar';
import { CORE, INK, mountPlate, platePoint, SCREEN_DIM, SCREEN_INK, TRACE, YEL } from './plateKit';

/**
 * The signal monitor — is Gaza / the West Bank still on the air? Two chart
 * recorder channels of IODA's measurements over the past week, each trace
 * scaled to its own weekly median (1.0 = normal): BGP solid, PROBE dotted.
 * IODA-detected outages shade amber; the lamp reads OUTAGE / DEGRADED / NOMINAL.
 */

export const W = 260, H = 446;
const X0 = 10, Y0 = 22, SW = 240, SH = 328;
const CH_H = 124, CH_Y = [Y0 + 40, Y0 + 40 + CH_H + 26];   // the two channels
const PX = X0 + 8, PW = SW - 16;                              // the plot's x span
const TOP = 1.25;                                             // ratio at the channel's top

const median = (v: (number | null)[]) => {
  const n = v.filter((x): x is number => x != null).sort((a, b) => a - b);
  return n[n.length >> 1] || 1;
};

export function SignalMonitor({ signal }: { signal: SignalFeed | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const now = Date.now() / 1000;
    const regions = (signal?.regions ?? []).map(r => ({ ...r, st: status(r, now), mb: median(r.bgp), mp: median(r.ping) }));
    const n = regions[0]?.bgp.length ?? 1;
    const xOf = (t: number) => PX + ((t - signal!.from) / (n * BIN)) * PW;
    let hoverX: number | null = null;

    const stop = mountPlate(cv, W, H, ({ ctx, t, line, screen, grain }, ms) => {
      screen(X0, Y0, SW, SH);
      t(signal ? '[ SIGNAL ]' : '[ NO SIGNAL ]', X0 + 6, Y0 + 13, 8.5, SCREEN_INK);
      t('NET / 7 D', X0 + SW - 6, Y0 + 13, 5.5, SCREEN_INK, 'right');

      regions.forEach((r, i) => {
        const y0 = CH_Y[i], yOf = (ratio: number) => y0 + CH_H - (Math.min(ratio, TOP) / TOP) * CH_H;
        // the lamp: amber and blinking when the region is dark
        const alarm = r.st !== 'NOMINAL';
        const lit = !alarm || Math.floor(ms / 500) % 2 === 0;
        t(r.name, PX, y0 - 8, 7, SCREEN_INK);
        ctx.strokeStyle = alarm ? YEL : SCREEN_INK; ctx.lineWidth = 0.7;
        ctx.strokeRect(X0 + SW - 58, y0 - 15, 50, 10);
        if (lit) t(r.st, X0 + SW - 33, y0 - 7.5, 5.5, alarm ? YEL : CORE, 'center');

        // graticule: 1.0 = the week's median, 0.5 = half the region gone
        ctx.strokeStyle = SCREEN_DIM; ctx.lineWidth = 0.6; ctx.strokeRect(PX, y0, PW, CH_H);
        ctx.setLineDash([2, 3]);
        line(PX, yOf(1), PX + PW, yOf(1), SCREEN_DIM);
        line(PX, yOf(0.5), PX + PW, yOf(0.5), SCREEN_DIM);
        ctx.setLineDash([]);
        t('1.0', PX + 2, yOf(1) - 2, 4.5, SCREEN_DIM);
        t('0.5', PX + 2, yOf(0.5) - 2, 4.5, SCREEN_DIM);
        for (let d = 1; d < 7; d++) line(PX + (d / 7) * PW, y0 + CH_H - 3, PX + (d / 7) * PW, y0 + CH_H, SCREEN_INK);

        // IODA's detected outages
        ctx.fillStyle = 'rgba(240,192,44,0.22)';
        for (const o of r.outages) {
          const a = Math.max(PX, xOf(o.start)), b = Math.min(PX + PW, xOf(o.end));
          if (b > a) ctx.fillRect(a, y0, Math.max(b - a, 1), CH_H);
        }

        const trace = (v: (number | null)[], m: number, dash: number[], alpha: number) => {
          ctx.save();
          ctx.strokeStyle = TRACE; ctx.lineWidth = 0.9; ctx.globalAlpha = alpha; ctx.setLineDash(dash);
          ctx.shadowColor = TRACE; ctx.shadowBlur = 4;
          ctx.beginPath();
          let pen = false;
          v.forEach((x, k) => {
            if (x == null) { pen = false; return; }
            const px = PX + ((k + 0.5) / n) * PW, py = yOf(x / m);
            if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
            pen = true;
          });
          ctx.stroke();
          ctx.restore();
        };
        trace(r.ping, r.mp, [1.5, 1.5], 0.7);
        trace(r.bgp, r.mb, [], 1);

        // the pen: a bright head on the newest reading
        const k = r.bgp.findLastIndex(x => x != null);
        if (k >= 0) {
          ctx.fillStyle = CORE; ctx.shadowColor = TRACE; ctx.shadowBlur = 8 * (0.6 + 0.4 * Math.sin(ms / 300));
          ctx.beginPath(); ctx.arc(PX + ((k + 0.5) / n) * PW, yOf(r.bgp[k]! / r.mb), 1.6, 0, 7); ctx.fill();
          ctx.shadowBlur = 0;
        }

        // the reading under the pointer
        if (hoverX != null) {
          const b = Math.floor(((hoverX - PX) / PW) * n);
          line(hoverX, y0, hoverX, y0 + CH_H, SCREEN_INK, 0.5);
          if (i === 0) {
            const iso = new Date((signal!.from + b * BIN) * 1000).toISOString();
            t(`${iso.slice(5, 10)} ${iso.slice(11, 16)}Z`, X0 + SW - 6, Y0 + SH - 6, 5, SCREEN_INK, 'right');
          }
          const f = (v: number | null) => (v == null ? '--' : Math.round(v).toString());
          t(`BGP ${f(r.bgp[b])}  PROBE ${f(r.ping[b])}`, PX + PW - 2, y0 + 8, 5, CORE, 'right');
        }
      });
      t('— BGP   ··· PROBE   ▮ OUTAGE', X0 + 6, Y0 + SH - 6, 5, SCREEN_INK);
      grain(X0, Y0, SW, SH);

      // ── readouts, the radar's table style ─────────────────────────────────
      const ty = Y0 + SH + 8;
      ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.strokeRect(X0, ty, SW, 76);
      const cw = SW / 2;
      regions.forEach((r, i) => {
        const x = X0 + i * cw + 6;
        if (i) line(X0 + cw, ty + 6, X0 + cw, ty + 70, INK);
        const last = r.bgp.findLast(x => x != null), lastP = r.ping.findLast(x => x != null);
        const recent = r.outages.filter(o => o.end > now - 30 * 86400);
        const lastOut = recent.at(-1);
        ctx.strokeStyle = INK; ctx.strokeRect(x, ty + 6, r.name.length * 3.6 + 10, 8);
        t(r.name, x + 5, ty + 12, 5);
        [
          `BGP ${last != null ? Math.round(last) : '--'} / ${Math.round(r.mb)} BLK`,
          `PROBE ${lastP != null ? Math.round(lastP) : '--'} / ${Math.round(r.mp)}`,
          `OUTAGES 30D ${recent.length}`,
          `LAST ${lastOut ? new Date(lastOut.start * 1000).toISOString().slice(2, 10).replace(/-/g, '.') : 'NONE'}`,
          `STATUS ${r.st}`,
        ].forEach((row, j) => t(row, x, ty + 24 + j * 9, 5.5));
      });
      if (!signal) t('IODA UNREACHABLE', X0 + SW / 2, ty + 40, 6.5, INK, 'center');
      t('SRC IODA / GEORGIA TECH', X0, H - 3, 5);
    });

    const move = (e: PointerEvent) => {
      const { x } = platePoint(cv, W, H, e);
      hoverX = signal && x >= PX && x < PX + PW ? x : null;
    };
    const leave = () => { hoverX = null; };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerdown', move);
    cv.addEventListener('pointerleave', leave);
    return () => { stop(); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerdown', move); cv.removeEventListener('pointerleave', leave); };
  }, [signal]);

  return (
    <canvas
      ref={ref}
      className="plate signal"
      role="img"
      aria-label={signal
        ? `Internet signal monitor, past week: ${signal.regions.map(r => `${r.name} ${status(r, Date.now() / 1000)}`).join(', ')}.`
        : 'Internet signal feed unavailable'}
      style={{ aspectRatio: `${W} / ${H}` }}
    />
  );
}
