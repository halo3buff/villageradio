'use client';

import { useEffect, useRef } from 'react';
import type { Contact, RadarFeed } from '@/lib/radar';
import { CORE, INK, mountPlate, platePoint, SCREEN_DIM, SCREEN_INK, TRACE, YEL } from './plateKit';

/**
 * The radar — a PPI scope in the station plate's print (mint stock, olive screen,
 * film grain), sweeping a year of West Bank OCHA reports. Bearing = date: the
 * year runs clockwise from 12 o'clock, today just behind it, so one revolution
 * replays the year. Range = how many, on a log scale (rings at 1/10/100/1000).
 * Contacts glow as the sweep crosses them and fade over the revolution.
 * The figures table under it carries the running totals for all three fronts.
 */

// plate units; the canvas scales them to fit
const W = 372, SCR = 328, X0 = 22, Y0 = 22;
const TABLE_H = 96, H = Y0 + SCR + TABLE_H;
const CX = X0 + SCR / 2, CY = Y0 + SCR / 2, R = SCR / 2 - 18;
const PERIOD = 9000;            // ms per revolution
const YEAR = 365;
const LOG_MAX = Math.log10(1001);


type Series = { key: keyof Omit<Contact, 'date'>; label: string; color: string; glyph: 'dot' | 'square' | 'cross' | 'ring' };
const SERIES: Series[] = [
  { key: 'displaced', label: 'DISPLACED', color: TRACE, glyph: 'square' },
  { key: 'attacks', label: 'SETTLER ATK', color: CORE, glyph: 'dot' },
  { key: 'injured', label: 'INJURED', color: TRACE, glyph: 'cross' },
  { key: 'killed', label: 'KILLED', color: YEL, glyph: 'ring' },
];

type Blip = { x: number; y: number; bearing: number; s: Series; c: Contact };

function blips(cs: Contact[], today: string): Blip[] {
  const t0 = Date.parse(today);
  const out: Blip[] = [];
  for (const c of cs) {
    const ago = (t0 - Date.parse(c.date)) / 864e5;
    const bearing = 2 * Math.PI * (1 - ago / YEAR);   // clockwise from north
    for (const s of SERIES) {
      const v = c[s.key];
      if (!v) continue;
      const r = (Math.log10(1 + v) / LOG_MAX) * R;
      out.push({ x: CX + Math.sin(bearing) * r, y: CY - Math.cos(bearing) * r, bearing, s, c });
    }
  }
  return out;
}

const n = (v: number) => v.toLocaleString('en-US');

export function RadarScope({ feed }: { feed: RadarFeed | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const today = feed?.summary.westBank.updated ?? new Date().toISOString().slice(0, 10);
    const all = feed ? blips(feed.contacts, today) : [];
    let hover: Blip | null = null;

    const stop = mountPlate(cv, W, H, ({ ctx, s, mono, t, line, screen, grain }, now) => {
      const glyph = (b: Blip, a: number) => {
        const sz = 1.4 + (b.s.key === 'killed' ? 1.2 : 0);
        ctx.globalAlpha = a;
        ctx.fillStyle = ctx.strokeStyle = b.s.color; ctx.lineWidth = 0.8;
        ctx.shadowColor = b.s.color; ctx.shadowBlur = 6 * s * a;
        ctx.beginPath();
        if (b.s.glyph === 'dot') { ctx.arc(b.x, b.y, sz, 0, 7); ctx.fill(); }
        else if (b.s.glyph === 'square') { ctx.rect(b.x - sz, b.y - sz, sz * 2, sz * 2); ctx.stroke(); }
        else if (b.s.glyph === 'cross') { ctx.moveTo(b.x - sz, b.y); ctx.lineTo(b.x + sz, b.y); ctx.moveTo(b.x, b.y - sz); ctx.lineTo(b.x, b.y + sz); ctx.stroke(); }
        else { ctx.arc(b.x, b.y, sz, 0, 7); ctx.stroke(); }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      };

      // ── the screen ─────────────────────────────────────────────────────────
      screen(X0, Y0, SCR, SCR);

      // range rings, log: 1 / 10 / 100 / 1000
      for (const [k, v] of [1, 10, 100, 1000].entries()) {
        const r = (Math.log10(1 + v) / LOG_MAX) * R;
        ctx.strokeStyle = SCREEN_DIM; ctx.lineWidth = 0.6;
        if (k < 3) ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.arc(CX, CY, r, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
        t(String(v), CX + r + 2, CY - 2, 4.5, SCREEN_DIM);
      }
      line(CX - R, CY, CX + R, CY, SCREEN_DIM); line(CX, CY - R, CX, CY + R, SCREEN_DIM);
      // month ticks round the rim, labelled at their start
      const t0 = Date.parse(today);
      for (let m = 0; m < 12; m++) {
        const d = new Date(t0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - m);
        const b = 2 * Math.PI * (1 - (t0 - d.getTime()) / 864e5 / YEAR);
        const sx = Math.sin(b), cy = -Math.cos(b);
        line(CX + sx * R, CY + cy * R, CX + sx * (R + 4), CY + cy * (R + 4), SCREEN_INK);
        t(d.toISOString().slice(5, 7), CX + sx * (R + 10), CY + cy * (R + 10) + 2, 5, SCREEN_INK, 'center');
      }

      const sweep = ((now % PERIOD) / PERIOD) * 2 * Math.PI;
      // the beam's afterglow: a wedge trailing the arm
      if ('createConicGradient' in ctx) {
        const cg = ctx.createConicGradient(sweep - Math.PI / 2 - 0.9, CX, CY);
        cg.addColorStop(0, 'rgba(98,242,182,0)'); cg.addColorStop(0.9 / (2 * Math.PI), 'rgba(98,242,182,0.16)');
        cg.addColorStop(0.9 / (2 * Math.PI) + 0.001, 'rgba(98,242,182,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(CX, CY, R, 0, 7); ctx.fill();
      }
      line(CX, CY, CX + Math.sin(sweep) * R, CY - Math.cos(sweep) * R, TRACE, 1);

      // contacts: bright as the beam passes, fading to a floor over the turn
      for (const b of all) {
        const behind = (sweep - (b.bearing % (2 * Math.PI)) + 4 * Math.PI) % (2 * Math.PI);
        glyph(b, b === hover ? 1 : Math.max(0.18, Math.exp(-behind * 0.9)));
      }

      t(feed ? '[ TRACKING ]' : '[ NO SIGNAL ]', X0 + 6, Y0 + 13, 8.5, SCREEN_INK);
      t('WEST BANK / 365 D', X0 + SCR - 6, Y0 + 13, 5.5, SCREEN_INK, 'right');
      // legend, bottom-left; the hovered contact, bottom-right
      SERIES.forEach((sr, i) => {
        const y = Y0 + SCR - 8 - (SERIES.length - 1 - i) * 8;
        glyph({ x: X0 + 9, y: y - 2, bearing: 0, s: sr, c: null! }, 0.9);
        t(sr.label, X0 + 15, y, 5, SCREEN_INK);
      });
      if (hover) {
        const c = hover.c;
        t(c.date, X0 + SCR - 6, Y0 + SCR - 32, 5.5, SCREEN_INK, 'right');
        SERIES.forEach((sr, i) => t(`${sr.label} ${c[sr.key]}`, X0 + SCR - 6, Y0 + SCR - 24 + i * 6.5, 5,
          sr.key === hover!.s.key ? CORE : SCREEN_DIM, 'right'));
      }
      grain(X0, Y0, SCR, SCR);

      // ── the figures table, the station's readout columns ──────────────────
      const ty = Y0 + SCR + 8;
      ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.strokeRect(X0, ty, SCR, TABLE_H - 20);
      if (feed) {
        const { gaza: gz, westBank: wb, lebanon: lb } = feed.summary;
        const cols: [string, string[]][] = [
          ['WEST BANK', [`KILLED ${n(wb.killed)}`, `CHILDREN ${n(wb.children)}`, `INJURED ${n(wb.injured)}`, `SETTLER ATK ${n(wb.attacks)}`, `DISPLACED ${n(wb.displaced)}`, `UPD ${wb.updated}`]],
          ['GAZA', [`KILLED ${n(gz.killed)}`, `CHILDREN ${n(gz.children)}`, `WOMEN ${n(gz.women)}`, `MEDICS ${n(gz.medical)} PRESS ${n(gz.press)}`, `INJURED ${n(gz.injured)}`, `UPD ${gz.updated}`]],
          ['LEBANON', [`KILLED ${n(lb.killed)}`, `INJURED ${n(lb.injured)}`, `SINCE ${lb.since}`, `UPD ${lb.updated}`, '', '> SINCE 2023-10-07 <']],
        ];
        const cw = SCR / 3;
        cols.forEach(([head, rows], i) => {
          const x = X0 + i * cw + 6;
          if (i) line(X0 + i * cw, ty + 6, X0 + i * cw, ty + TABLE_H - 26, INK);
          ctx.font = `700 5px ${mono}`;
          const hw = ctx.measureText(head).width + 10;
          ctx.strokeStyle = INK; ctx.strokeRect(x, ty + 6, hw, 8);
          t(head, x + 5, ty + 12, 5);
          rows.forEach((r, j) => t(r, x, ty + 24 + j * 9, 5.5));
        });
      } else t('FEED UNREACHABLE — RETRYING HOURLY', CX, ty + 40, 6.5, INK, 'center');
      t('SRC TECH FOR PALESTINE / UN OCHA / GAZA + LEBANON MOH', X0, H - 3, 5);
    });

    const pick = (e: PointerEvent) => {
      const { x: px, y: py } = platePoint(cv, W, H, e);
      let best: Blip | null = null, bd = 36;   // within 6 units
      for (const b of all) {
        const d = (b.x - px) ** 2 + (b.y - py) ** 2;
        if (d < bd) { bd = d; best = b; }
      }
      hover = best;
    };
    cv.addEventListener('pointermove', pick);
    cv.addEventListener('pointerdown', pick);
    return () => { stop(); cv.removeEventListener('pointermove', pick); cv.removeEventListener('pointerdown', pick); };
  }, [feed]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={feed
        ? `Radar of West Bank incidents over the past year. West Bank: ${feed.summary.westBank.killed} killed, ${feed.summary.westBank.attacks} settler attacks. Gaza: ${feed.summary.gaza.killed} killed.`
        : 'Radar feed unavailable'}
      className="plate radar"
      style={{ aspectRatio: `${W} / ${H}`, touchAction: 'manipulation' }}
    />
  );
}
