'use client';

import { useEffect, useRef } from 'react';
import type { TelexLine } from '@/lib/radar';
import { INK, mountPlate, platePoint } from './plateKit';

/**
 * The teleprinter — every report and outage the console receives, printed
 * on tractor-feed paper in the stock's own ink, oldest at the top. On arrival
 * the newest lines type themselves in; wheel / drag scrolls back through the roll.
 */

export const W = 260, H = 446;
const X0 = 10, Y0 = 22, PW = 240, PH = 328;
const LH = 8.5;                       // line height
const TX = X0 + 14;                   // the type's left margin, clear of the feed holes
const VISIBLE = Math.floor((PH - 16) / LH);
const TYPED = 8;                      // the newest lines typed in on arrival
const CPS = 45;                       // characters per second

export function Teleprinter({ lines }: { lines: TelexLine[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const start = performance.now();
    const typedFrom = Math.max(0, lines.length - TYPED);
    // where each typed line starts, in characters typed so far
    const at: number[] = [];
    let acc = 0;
    for (let i = typedFrom; i < lines.length; i++) { at.push(acc); acc += lines[i].text.length + 6; }
    let back = 0;                     // lines scrolled back from the newest

    const stop = mountPlate(cv, W, H, ({ ctx, mono, t, line }, now) => {
      const typed = ((now - start) / 1000) * CPS;
      // how many lines are on the paper, and how much of the last one
      let shown = typedFrom, partial = '';
      for (let k = 0; k < at.length; k++) {
        if (typed < at[k]) break;
        const text = lines[typedFrom + k].text;
        const c = Math.floor(typed - at[k]);
        if (c >= text.length) shown = typedFrom + k + 1;
        else { partial = text.slice(0, c); shown = typedFrom + k; break; }
      }

      // the paper: a lighter sheet with feed holes down both margins
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(X0, Y0, PW, PH);
      ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.strokeRect(X0, Y0, PW, PH);
      ctx.fillStyle = 'rgba(43,54,38,0.25)';
      const roll = (shown + (partial ? 1 : 0)) * LH;   // holes travel with the paper
      for (let y = Y0 + 6 - (roll % 12) + 12; y < Y0 + PH - 3; y += 12) {
        for (const x of [X0 + 5, X0 + PW - 5]) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); }
      }
      line(X0 + 10, Y0, X0 + 10, Y0 + PH, 'rgba(43,54,38,0.2)', 0.5);
      line(X0 + PW - 10, Y0, X0 + PW - 10, Y0 + PH, 'rgba(43,54,38,0.2)', 0.5);

      // the roll, bottom-up from the print head
      ctx.save();
      ctx.beginPath(); ctx.rect(X0, Y0, PW, PH); ctx.clip();
      const rows = lines.slice(0, shown).map(l => l.text);
      if (partial) rows.push(partial);
      const end = Math.max(0, rows.length - back);
      const baseY = Y0 + PH - 10;
      for (let k = 0; k < VISIBLE && end - 1 - k >= 0; k++) {
        const text = rows[end - 1 - k];
        t(text, TX, baseY - k * LH, 5, text.includes('OUTAGE') ? '#7a2a10' : INK);
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
      t(`${lines.length} MSG`, X0 + PW, Y0 - 5, 5.5, INK, 'right');

      // ── the footer, the radar's table style ───────────────────────────────
      const ty = Y0 + PH + 8;
      ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.strokeRect(X0, ty, PW, 76);
      const count = (k: string) => lines.filter(l => l.text.includes(k)).length;
      [
        `WB REPORTS ${count(' WB ')}  (OCHA, 365 D)`,
        `GAZA REPORTS ${count(' GAZA ')}  (MOH, 45 D)`,
        `NET OUTAGES ${count('OUTAGE')}  (IODA, 30 D)`,
        `LAST RX ${lines.at(-1)?.text.slice(0, 8) ?? '--'}`,
        lines.length ? '> RECEIVING <' : '> LINE DEAD <',
      ].forEach((row, j) => t(row, X0 + 6, ty + 14 + j * 11, 5.5));
      t('KIA KILLED / INJ INJURED / DISPL DISPLACED', X0, H - 3, 5);
    });

    // scroll the roll: wheel on desktop, drag on touch
    const max = () => Math.max(0, lines.length - VISIBLE);
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
      cv.removeEventListener('wheel', wheel);
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [lines]);

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
