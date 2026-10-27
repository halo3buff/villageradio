'use client';

import { useEffect, useRef } from 'react';
import type { Aircraft } from '@/lib/air';
import type { Fire } from '@/lib/fires';
import type { RadarFeed } from '@/lib/radar';
import { CORE, INK, mountPlate, platePoint, SCREEN_DIM, SCREEN_INK, TRACE, YEL } from './plateKit';
import { loadGeo, rings, type Geo } from './geo';
import { AIR_EVENT } from './Airspace';

/**
 * The radar — a PPI scope over Gaza and the West Bank on a faint map, 100 km to the
 * rim. It plots what can be seen at an exact place: every fire or heat source NASA's
 * satellites picked up in the past 7 days (bigger = hotter, bright = last 24 h), and
 * every military aircraft broadcasting right now (from the airspace panel's feed).
 * Contacts glow as the sweep crosses them. Hover one for when, where and the nearest
 * town. The table under it carries the running casualty totals for all three fronts.
 */

const W = 372, SCR = 328, X0 = 22, Y0 = 22;
const TABLE_H = 96, H = Y0 + SCR + TABLE_H;
const CX = X0 + SCR / 2, CY = Y0 + SCR / 2, R = SCR / 2 - 14;
const C_LON = 34.92, C_LAT = 31.88, RANGE_KM = 100;
const SC = (R * 111) / RANGE_KM;                  // plate units per degree of latitude
const K = Math.cos((C_LAT * Math.PI) / 180);
const PERIOD = 6000;                              // ms per revolution
const DAY = 86400;

const p = (lon: number, lat: number): [number, number] => [CX + (lon - C_LON) * K * SC, CY - (lat - C_LAT) * SC];
const bearingOf = (x: number, y: number) => (Math.atan2(x - CX, CY - y) + 2 * Math.PI) % (2 * Math.PI);

type Place = [string, string, number, number, number, string, 0 | 1];
type Blip = { x: number; y: number; b: number; fire?: Fire; ac?: Aircraft };

const n = (v: number) => v.toLocaleString('en-US');
const when = (t: number) => new Date(t * 1000).toISOString().slice(5, 16).replace('T', ' ').replace('-', '.') + 'Z';

export function RadarScope({ feed: latest, fires: latestFires }: { feed: RadarFeed | null; fires: Fire[] | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // the page refreshes both in the background; the running scope picks them up next frame
  const live = useRef({ feed: latest, fires: latestFires });
  useEffect(() => { live.current = { feed: latest, fires: latestFires }; }, [latest, latestFires]);

  useEffect(() => {
    const cv = ref.current!;
    let geo: Geo | null = null, cities: Place[] = [];
    let fires: Fire[] | null | undefined, fireBlips: Blip[] = [], airBlips: Blip[] = [];
    let hover: Blip | null = null;
    let alive = true;
    loadGeo().then(g => { geo = g; });
    fetch('/map/places.json').then(r => (r.ok ? r.json() : [])).then((ps: Place[]) => { if (alive) cities = ps.filter(x => x[4] === 0); }).catch(() => {});

    const onAir = (e: Event) => {
      airBlips = (e as CustomEvent<Aircraft[]>).detail.filter(a => a.mil).map(ac => {
        const [x, y] = p(ac.lon, ac.lat);
        return { x, y, b: bearingOf(x, y), ac };
      });
    };
    window.addEventListener(AIR_EVENT, onAir);

    const stop = mountPlate(cv, W, H, ({ ctx, s, mono, t, line, screen, grain }, now) => {
      const { feed } = live.current;
      if (fires !== live.current.fires) {
        fires = live.current.fires;
        fireBlips = (fires ?? []).map(f => { const [x, y] = p(f.lon, f.lat); return { x, y, b: bearingOf(x, y), fire: f }; });
        hover = null;
      }
      const nowS = Date.now() / 1000;

      // ── the screen ─────────────────────────────────────────────────────────
      screen(X0, Y0, SCR, SCR);
      ctx.save();
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, 7); ctx.clip();

      // the map, faint: coast, Gaza and the West Bank, the settlements, the cities
      if (geo) {
        ctx.beginPath(); rings(ctx, geo.coast, p, false);
        ctx.strokeStyle = SCREEN_DIM; ctx.lineWidth = 0.6; ctx.stroke();
        ctx.beginPath(); rings(ctx, [...geo.wb, ...geo.gaza], p);
        ctx.fillStyle = 'rgba(98,242,182,0.07)'; ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(98,242,182,0.4)'; ctx.lineWidth = 0.6; ctx.stroke();
        ctx.fillStyle = 'rgba(240,192,44,0.35)';
        for (const st of geo.sites) { const [x, y] = p(st.c[0], st.c[1]); ctx.fillRect(x - 0.4, y - 0.4, 0.8, 0.8); }
      }
      for (const c of cities) {
        const [x, y] = p(c[2], c[3]);
        ctx.fillStyle = SCREEN_DIM; ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
        t(c[0], x + 2.5, y + 1.5, 4, 'rgba(98,242,182,0.45)');
      }

      // range rings every 25 km, bearing ticks every 30°
      for (const km of [25, 50, 75]) {
        const r = (km / RANGE_KM) * R;
        ctx.strokeStyle = SCREEN_DIM; ctx.lineWidth = 0.5; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.arc(CX, CY, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        t(`${km}`, CX + 2, CY - r - 1.5, 4, SCREEN_DIM);
      }

      const sweep = ((now % PERIOD) / PERIOD) * 2 * Math.PI;
      if ('createConicGradient' in ctx) {
        const cg = ctx.createConicGradient(sweep - Math.PI / 2 - 0.9, CX, CY);
        cg.addColorStop(0, 'rgba(98,242,182,0)'); cg.addColorStop(0.9 / (2 * Math.PI), 'rgba(98,242,182,0.14)');
        cg.addColorStop(0.9 / (2 * Math.PI) + 0.001, 'rgba(98,242,182,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(CX, CY, R, 0, 7); ctx.fill();
      }
      line(CX, CY, CX + Math.sin(sweep) * R, CY - Math.cos(sweep) * R, TRACE, 1);
      const lit = (b: Blip) => Math.exp(-(((sweep - b.b) + 4 * Math.PI) % (2 * Math.PI)) * 0.9);

      // fires: size by heat, bright for the last day, the newest ringed
      for (const bl of fireBlips) {
        const f = bl.fire!, age = nowS - f.t, fresh = age < DAY;
        const ours = f.region !== '';
        const color = ours ? YEL : SCREEN_INK;
        const a = bl === hover ? 1 : Math.max(fresh ? 0.6 : ours ? 0.3 : 0.15, lit(bl));
        const r = Math.min(4, 1 + Math.sqrt(Math.max(0, f.frp)) * 0.45);
        ctx.globalAlpha = a; ctx.fillStyle = ctx.strokeStyle = color; ctx.lineWidth = 0.7;
        ctx.shadowColor = color; ctx.shadowBlur = (fresh ? 8 : 3) * s * a;
        ctx.beginPath(); ctx.arc(bl.x, bl.y, r, 0, 7);
        if (fresh) ctx.fill(); else ctx.stroke();
        if (fresh && ours) {
          const ph = (now / 1400) % 1;
          ctx.globalAlpha = 0.6 * (1 - ph); ctx.strokeStyle = CORE;
          ctx.beginPath(); ctx.arc(bl.x, bl.y, r + 2 + ph * 6, 0, 7); ctx.stroke();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }

      // military aircraft, live
      for (const bl of airBlips) {
        const a = bl === hover ? 1 : Math.max(0.55, lit(bl));
        ctx.globalAlpha = a; ctx.strokeStyle = YEL; ctx.lineWidth = 0.8;
        ctx.shadowColor = YEL; ctx.shadowBlur = 6 * s * a;
        ctx.beginPath();
        ctx.moveTo(bl.x, bl.y - 2.6); ctx.lineTo(bl.x + 2.6, bl.y); ctx.lineTo(bl.x, bl.y + 2.6); ctx.lineTo(bl.x - 2.6, bl.y); ctx.closePath();
        ctx.stroke(); ctx.shadowBlur = 0;
        t(bl.ac!.type || 'MIL', bl.x + 4, bl.y + 1.5, 4.2, YEL);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // the rim: bearings
      ctx.strokeStyle = SCREEN_INK; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, 7); ctx.stroke();
      for (let d = 0; d < 360; d += 10) {
        const b = (d * Math.PI) / 180, sx = Math.sin(b), cy = -Math.cos(b), long = d % 30 === 0;
        line(CX + sx * R, CY + cy * R, CX + sx * (R + (long ? 4 : 2)), CY + cy * (R + (long ? 4 : 2)), SCREEN_INK);
      }
      t('N', CX, Y0 + 9.5, 5, SCREEN_INK, 'center');

      // header, legend, the hovered contact
      const ours = (fires ?? []).filter(f => f.region);
      const day = ours.filter(f => nowS - f.t < DAY).length;
      t(fires === null ? '[ NO SIGNAL ]' : '[ TRACKING ]', X0 + 6, Y0 + 13, 8.5, SCREEN_INK);
      t(`FIRES 24H ${day} / 7D ${ours.length}`, X0 + SCR - 6, Y0 + 11, 5.5, day ? CORE : SCREEN_INK, 'right');
      t(`MIL AIRCRAFT ${airBlips.length}`, X0 + SCR - 6, Y0 + 18, 5, airBlips.length ? YEL : SCREEN_INK, 'right');
      const leg: [string, (x: number, y: number) => void][] = [
        ['FIRE / HEAT, LAST 24 H', (x, y) => { ctx.fillStyle = YEL; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); }],
        ['FIRE / HEAT, 1-7 DAYS', (x, y) => { ctx.strokeStyle = YEL; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.stroke(); }],
        ['MILITARY AIRCRAFT, NOW', (x, y) => { ctx.strokeStyle = YEL; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + 2, y); ctx.lineTo(x, y + 2); ctx.lineTo(x - 2, y); ctx.closePath(); ctx.stroke(); }],
        ['SETTLEMENT', (x, y) => { ctx.fillStyle = 'rgba(240,192,44,0.6)'; ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6); }],
      ];
      leg.forEach(([label, draw], i) => {
        const y = Y0 + SCR - 8 - (leg.length - 1 - i) * 7.5;
        draw(X0 + 9, y - 1.8);
        t(label, X0 + 15, y, 4.5, SCREEN_INK);
      });
      if (hover?.fire) {
        const f = hover.fire;
        const rows = [
          `${f.region || 'OUTSIDE PALESTINE'}  ${when(f.t)}`,
          f.near ? `${f.near.km} KM ${f.near.dir} OF ${f.near.en}` : `${f.lat.toFixed(3)}N ${f.lon.toFixed(3)}E`,
          `HEAT ${f.frp} MW  SAT ${f.sat}${f.conf === 'l' || f.conf === 'low' ? '  LOW CONF' : ''}`,
        ];
        rows.forEach((r, i) => t(r, X0 + SCR - 6, Y0 + SCR - 22 + i * 7, 5, i ? SCREEN_INK : CORE, 'right'));
      } else if (hover?.ac) {
        const a = hover.ac;
        t(`MIL ${a.type || '?'} ${a.flight || a.reg || a.hex}`, X0 + SCR - 6, Y0 + SCR - 15, 5, CORE, 'right');
        t(`${a.alt == null ? '---' : a.alt === 0 ? 'GROUND' : `${a.alt} FT`}  ${Math.round(a.gs)} KT  HDG ${Math.round(a.track)}`, X0 + SCR - 6, Y0 + SCR - 8, 5, SCREEN_INK, 'right');
      } else {
        t('HOVER A CONTACT', X0 + SCR - 6, Y0 + SCR - 8, 4.5, SCREEN_DIM, 'right');
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
      } else t('FEED UNREACHABLE — RETRYING', CX, ty + 40, 6.5, INK, 'center');
      t('SRC NASA FIRMS VIIRS / ADS-B / OCHA + MOH VIA TECH FOR PALESTINE / OSM', X0, H - 3, 5);
    });

    const pick = (e: PointerEvent) => {
      const { x: px, y: py } = platePoint(cv, W, H, e);
      let best: Blip | null = null, bd = 36;   // within 6 units
      for (const b of [...fireBlips, ...airBlips]) {
        const d = (b.x - px) ** 2 + (b.y - py) ** 2;
        if (d < bd) { bd = d; best = b; }
      }
      hover = best;
    };
    cv.addEventListener('pointermove', pick);
    cv.addEventListener('pointerdown', pick);
    return () => {
      alive = false; stop(); window.removeEventListener(AIR_EVENT, onAir);
      cv.removeEventListener('pointermove', pick); cv.removeEventListener('pointerdown', pick);
    };
  }, []);

  const ours = (latestFires ?? []).filter(f => f.region);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`Radar map of Gaza and the West Bank: ${ours.length} fires or heat sources seen by satellite in the past 7 days${
        ours.length ? `, latest near ${ours.at(-1)!.near?.en ?? 'an unnamed place'}` : ''}, and live military aircraft.${
        latest ? ` West Bank: ${latest.summary.westBank.killed} killed. Gaza: ${latest.summary.gaza.killed} killed.` : ''}`}
      className="plate radar"
      style={{ aspectRatio: `${W} / ${H}`, touchAction: 'manipulation' }}
    />
  );
}
