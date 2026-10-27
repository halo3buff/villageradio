'use client';

import { useEffect, useRef } from 'react';
import type { NetNow, TelexKind, TelexLine } from '@/lib/radar';
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
const MARK = X0 + 16;                  // the kind mark's column, clear of the feed holes
const TX = X0 + 21;                   // the type's left margin
const VISIBLE = Math.floor((PH - 16) / LH);
const CPS = 45;                      // characters per second
const PAUSE = 6;                      // the carriage return, in characters
const EVENT = 'vlg:telex';

const utc = () => {
  const iso = new Date().toISOString();
  return `${iso.slice(2, 10).replace(/-/g, '.')} ${iso.slice(11, 16)}Z`;
};

type Msg = TelexLine;

/** Print a live event on the teleprinter, stamped now. */
export function telex(text: string, k: TelexKind, hot = false) {
  window.dispatchEvent(new CustomEvent<Msg>(EVENT, { detail: { t: Date.now() / 1000, text: `${utc()} ${text}`, k, hot } }));
}

const RED = '#7a2a10';

/** The margin mark for a kind of line, centred on (x, y): the same marks the radar plots. */
function mark(ctx: CanvasRenderingContext2D, k: TelexKind, x: number, y: number, color: string) {
  ctx.fillStyle = ctx.strokeStyle = color; ctx.lineWidth = 0.6;
  ctx.beginPath();
  switch (k) {
    case 'report': ctx.moveTo(x - 1.6, y); ctx.lineTo(x + 1.6, y); ctx.moveTo(x, y - 1.6); ctx.lineTo(x, y + 1.6); ctx.stroke(); break;
    case 'fire': ctx.arc(x, y, 1.4, 0, 7); ctx.fill(); break;
    case 'air': ctx.moveTo(x, y - 1.8); ctx.lineTo(x + 1.8, y); ctx.lineTo(x, y + 1.8); ctx.lineTo(x - 1.8, y); ctx.closePath(); ctx.stroke(); break;
    case 'incident': ctx.moveTo(x, y - 1.8); ctx.lineTo(x + 1.7, y + 1.3); ctx.lineTo(x - 1.7, y + 1.3); ctx.closePath(); ctx.fill(); break;
    case 'alert': ctx.arc(x, y, 0.7, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x, y, 1.9, 0, 7); ctx.stroke(); break;
    case 'net': ctx.moveTo(x - 2, y + 0.8); ctx.lineTo(x - 0.7, y - 1); ctx.lineTo(x + 0.7, y + 1); ctx.lineTo(x + 2, y - 0.8); ctx.stroke(); break;
  }
}

export function Teleprinter({ lines, net }: { lines: TelexLine[]; net: NetNow | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(net);
  live.current = net;
  // The roll lives outside React. It is the server's list as of its latest refresh (which already
  // holds every report sorted by time, a corrected line replacing the old one) plus this page's live
  // events, always printed in time order. Only lines newer than everything already on the roll are
  // typed in at the bottom; the rest, and the whole roll on opening, are simply there.
  const roll = useRef({ server: [] as Msg[], local: [] as Msg[], queue: [] as Msg[], newest: -Infinity, started: 0, rows: [] as Msg[] });

  useEffect(() => {
    const r = roll.current;
    const first = !r.server.length && !r.local.length;
    const had = new Set(r.server.map(l => l.text));
    if (!first) r.queue.push(...lines.filter(l => !had.has(l.text) && l.t > r.newest));
    r.server = lines;
    for (const l of lines) r.newest = Math.max(r.newest, l.t);
  }, [lines]);

  useEffect(() => {
    const cv = ref.current!;
    const r = roll.current;
    const onEvent = (e: Event) => {
      const m = (e as CustomEvent<Msg>).detail;
      r.local.push(m); r.queue.push(m); r.newest = Math.max(r.newest, m.t);
    };
    window.addEventListener(EVENT, onEvent);
    let back = 0;                     // lines scrolled back from the newest

    const stop = mountPlate(cv, W, H, ({ ctx, mono, t, line }, now) => {
      // the head types the oldest queued line, then returns the carriage
      let partial = '';
      if (r.queue.length) {
        r.queue.sort((a, b) => a.t - b.t);
        if (!r.started) r.started = now;
        const text = r.queue[0].text;
        const c = Math.floor(((now - r.started) / 1000) * CPS);
        if (c >= text.length + PAUSE) { r.queue.shift(); r.started = 0; }
        else partial = text.slice(0, c);
      }
      const queued = new Set(r.queue);
      r.rows = [...r.server, ...r.local].filter(m => !queued.has(m)).sort((a, b) => a.t - b.t);
      const total = r.rows.length + r.queue.length;
      const shown = r.rows.length;

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
      const rows = partial ? [...r.rows, { ...r.queue[0], text: partial }] : r.rows;
      const end = Math.max(0, rows.length - back);
      const baseY = Y0 + PH - 10;
      for (let k = 0; k < VISIBLE && end - 1 - k >= 0; k++) {
        const m = rows[end - 1 - k], y = baseY - k * LH, color = m.hot ? RED : INK;
        mark(ctx, m.k, MARK, y - 1.8, color);
        t(m.text, TX, y, 5, color);
      }
      // the carriage: a block cursor after the last character, blinking once done
      if (!back && (partial || Math.floor(now / 530) % 2 === 0)) {
        ctx.font = `700 5px ${mono}`;
        ctx.fillStyle = INK;
        ctx.fillRect(TX + ctx.measureText((rows.at(-1)?.text ?? '').toUpperCase()).width + 1.5, baseY - 4.5, 3, 5);
      }
      ctx.restore();
      if (back) t(`▲ ${back} BACK`, X0 + PW - 14, Y0 + 9, 5, INK, 'right');

      t('TELEX / VLG-RX', X0, Y0 - 5, 5.5);
      t(`${total} MSG  ${r.queue.length ? 'RECEIVING' : total ? 'STANDING BY' : 'LINE DEAD'}`, X0 + PW, Y0 - 5, 5.5, INK, 'right');

      // ── the footer, the radar's table style ───────────────────────────────
      const ty = Y0 + PH + 8;
      ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.strokeRect(X0, ty, PW, 76);
      const all = [...r.server, ...r.local];
      const count = (k: TelexKind) => all.filter(l => l.k === k).length;
      const net = live.current;
      ([
        ['incident', `FIELD REPORTS ${count('incident')}`, 'WAFA/MA\'AN/QNN, 72 H'],
        ['alert', `SIRENS ${count('alert')}`, 'TZEVA ADOM'],
        ['fire', `SAT FIRES ${count('fire')}`, 'NASA VIIRS, 7 D'],
        ['air', `MIL AIRCRAFT ${all.filter(l => l.k === 'air' && l.hot).length}`, 'ADS-B, LIVE'],
        ['net', `NET ${count('net')}${net ? `  TRAFFIC ${Math.round(net.pct * 100)}%` : ''}`, 'IODA / CF'],
        ['report', `DAILY REPORTS ${count('report')}`, 'OCHA / MOH'],
      ] as [TelexKind, string, string][]).forEach(([k, label, src], j) => {
        const y = ty + 13 + j * 10.5;
        mark(ctx, k, X0 + 9, y - 1.8, INK);
        t(label, X0 + 15, y, 5.5);
        t(src, X0 + PW - 6, y, 4.5, INK, 'right');
      });
      t('RED: KILLED / STRIKE / SIRENS / OUTAGE / MIL', X0, H - 3, 5);
    });

    // scroll the roll: wheel on desktop, drag on touch
    const max = () => Math.max(0, r.rows.length - VISIBLE);
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
