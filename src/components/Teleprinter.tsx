'use client';

import { useEffect, useRef } from 'react';
import type { NetNow, TelexLine } from '@/lib/radar';
import { INK, mountPlate, platePoint } from './plateKit';

/**
 * The teleprinter — every report, outage and live event the console receives,
 * printed on tractor-feed paper in the stock's own ink as it arrives. The page
 * refreshes its reports in the background and other instruments wire live
 * events in through telex(); anything new joins the queue and types itself in.
 * Wheel / drag scrolls back through the roll.
 */

export const W = 260, H = 446;
const X0 = 10, Y0 = 22, PW = 240, PH = 328;
const LH = 8.5;                       // line height
const TX = X0 + 14;                   // the type's left margin, clear of the feed holes
const VISIBLE = Math.floor((PH - 16) / LH);
const TYPED = 8;                      // of the roll on arrival, the newest lines typed in
const CPS = 45;                       // characters per second
const PAUSE = 6;                      // the carriage return, in characters
const EVENT = 'vlg:telex';

const utc = () => {
  const iso = new Date().toISOString();
  return `${iso.slice(2, 10).replace(/-/g, '.')} ${iso.slice(11, 16)}Z`;
};

/** Print a live event on the teleprinter, stamped now. */
export function telex(text: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: `${utc()} ${text}` }));
}

const alarm = (text: string) => text.includes('OUTAGE') || text.includes(' MIL ') || text.includes('TRAFFIC DROP') || text.includes(' FIRE ');

export function Teleprinter({ lines, net }: { lines: TelexLine[]; net: NetNow | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(net);
  live.current = net;
  // the roll lives outside React: everything received, in order, and how far printing has got
  const roll = useRef({ received: [] as string[], seen: new Set<string>(), printed: 0, started: 0 });

  // report lines from the first load or a background refresh: the new ones join the queue
  useEffect(() => {
    const r = roll.current;
    for (const l of lines) {
      if (r.seen.has(l.text)) continue;
      r.seen.add(l.text); r.received.push(l.text);
    }
    // first arrival: lay most of the roll down at once, type the newest few
    if (r.printed === 0 && r.received.length > TYPED) r.printed = r.received.length - TYPED;
  }, [lines]);

  useEffect(() => {
    const cv = ref.current!;
    const r = roll.current;
    const onEvent = (e: Event) => { r.received.push((e as CustomEvent<string>).detail); };
    window.addEventListener(EVENT, onEvent);
    let back = 0;                     // lines scrolled back from the newest

    const stop = mountPlate(cv, W, H, ({ ctx, mono, t, line }, now) => {
      // the head types the next queued line, then returns the carriage
      let partial = '';
      if (r.printed < r.received.length) {
        if (!r.started) r.started = now;
        const text = r.received[r.printed];
        const c = Math.floor(((now - r.started) / 1000) * CPS);
        if (c >= text.length + PAUSE) { r.printed++; r.started = 0; }
        else partial = text.slice(0, c);
      }
      const shown = r.printed;

      // the paper: a lighter sheet with feed holes down both margins
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(X0, Y0, PW, PH);
      ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.strokeRect(X0, Y0, PW, PH);
      ctx.fillStyle = 'rgba(43,54,38,0.25)';
      const fed = (shown + (partial ? 1 : 0)) * LH;   // holes travel with the paper
      for (let y = Y0 + 6 - (fed % 12) + 12; y < Y0 + PH - 3; y += 12) {
        for (const x of [X0 + 5, X0 + PW - 5]) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); }
      }
      line(X0 + 10, Y0, X0 + 10, Y0 + PH, 'rgba(43,54,38,0.2)', 0.5);
      line(X0 + PW - 10, Y0, X0 + PW - 10, Y0 + PH, 'rgba(43,54,38,0.2)', 0.5);

      // the roll, bottom-up from the print head
      ctx.save();
      ctx.beginPath(); ctx.rect(X0, Y0, PW, PH); ctx.clip();
      const rows = r.received.slice(0, shown);
      if (partial) rows.push(partial);
      const end = Math.max(0, rows.length - back);
      const baseY = Y0 + PH - 10;
      for (let k = 0; k < VISIBLE && end - 1 - k >= 0; k++) {
        const text = rows[end - 1 - k];
        t(text, TX, baseY - k * LH, 5, alarm(text) ? '#7a2a10' : INK);
      }
      // the carriage: a block cursor after the last character, blinking once done
      if (!back && (partial || Math.floor(now / 530) % 2 === 0)) {
        ctx.font = `700 5px ${mono}`;
        ctx.fillStyle = INK;
        ctx.fillRect(TX + ctx.measureText((rows.at(-1) ?? '').toUpperCase()).width + 1.5, baseY - 4.5, 3, 5);
      }
      ctx.restore();
      if (back) t(`▲ ${back} BACK`, X0 + PW - 14, Y0 + 9, 5, INK, 'right');

      t('TELEX / VLG-RX', X0, Y0 - 5, 5.5);
      t(`${r.received.length} MSG`, X0 + PW, Y0 - 5, 5.5, INK, 'right');

      // ── the footer, the radar's table style ───────────────────────────────
      const ty = Y0 + PH + 8;
      ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.strokeRect(X0, ty, PW, 76);
      const count = (k: string) => r.received.filter(l => l.includes(k)).length;
      [
        `WB REPORTS ${count(' WB ')}  (OCHA, 365 D)`,
        `GAZA REPORTS ${count(' GAZA ')}  (MOH, 45 D)`,
        `NET OUTAGES ${count('OUTAGE')}  (IODA / CLOUDFLARE, 30 D)`,
        `SAT FIRES ${count(' FIRE ')}  MIL AIRCRAFT ${count(' MIL ')}  (7 D / LIVE)`,
        live.current
          ? `PS NET TRAFFIC ${Math.round(live.current.pct * 100)}% OF USUAL  (${live.current.at.slice(11, 16)}Z)`
          : `LAST RX ${r.received.at(-1)?.slice(0, 14) ?? '--'}`,
        shown < r.received.length ? '> RECEIVING <' : r.received.length ? '> STANDING BY <' : '> LINE DEAD <',
      ].forEach((row, j) => t(row, X0 + 6, ty + 13 + j * 10.5, 5.5));
      t('KIA KILLED / INJ INJURED / DISPL DISPLACED', X0, H - 3, 5);
    });

    // scroll the roll: wheel on desktop, drag on touch
    const max = () => Math.max(0, r.printed - VISIBLE);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      back = Math.min(max(), Math.max(0, back + Math.sign(e.deltaY) * -3));
    };
    let dragY: number | null = null;
    const down = (e: PointerEvent) => { dragY = platePoint(cv, W, H, e).y; };
    const move = (e: PointerEvent) => {
      if (dragY == null) return;
      const y = platePoint(cv, W, H, e).y, steps = Math.trunc((y - dragY) / LH);
      if (steps) { back = Math.min(max(), Math.max(0, back + steps)); dragY = y; }
    };
    const up = () => { dragY = null; };
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      stop();
      window.removeEventListener(EVENT, onEvent);
      cv.removeEventListener('wheel', wheel);
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="plate"
      role="img"
      aria-label={`Teleprinter: ${lines.slice(-5).map(l => l.text).join('; ')}`}
      style={{ aspectRatio: `${W} / ${H}`, touchAction: 'pan-x' }}
    />
  );
}
