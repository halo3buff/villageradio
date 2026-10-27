'use client';

import { useEffect, useRef } from 'react';
import type { Aircraft } from '@/lib/air';
import type { Alert } from '@/lib/alerts';
import type { Fire } from '@/lib/fires';
import type { RadarFeed } from '@/lib/radar';
import type { Incident } from '@/lib/wafa';

const sourcesOf = (x: Incident) => [...new Set([x.src, ...(x.also ?? []).map(a => a.src)])];   // as in lib/wafa, which is server-only
import { CORE, INK, mountPlate, platePoint, SCREEN, SCREEN_DIM, SCREEN_INK, TRACE, YEL } from './plateKit';
import { loadGeo, rings, type Geo } from './geo';
import { AIR_EVENT } from './Airspace';

/**
 * The radar — a round PPI scope over Gaza and the West Bank on a faint map, 100 km to the
 * rim, plotting everything that can be placed, with the teleprinter's marks:
 *   ▲ field reports (WAFA) at the village they name — raids, settler attacks, strikes…
 *   ◎ siren alerts in Israel where they sounded
 *   ● fires and heat NASA's satellites saw (bigger = hotter)
 *   ◇ military aircraft broadcasting right now
 * The newest pulse; everything fades with age. Hover a contact and the table under the
 * scope reads it out; otherwise the table carries the running casualty totals.
 */

const W = 372, SCR = 328, X0 = 22, Y0 = 22;
const TABLE_H = 96, H = Y0 + SCR + TABLE_H;
const CX = X0 + SCR / 2, CY = Y0 + SCR / 2, R = SCR / 2 - 18;
const C_LON = 34.92, C_LAT = 31.88, RANGE_KM = 100;
const SC = (R * 111) / RANGE_KM;                  // plate units per degree of latitude
const K = Math.cos((C_LAT * Math.PI) / 180);
const PERIOD = 6000;                              // ms per revolution
const HOUR = 3600, DAY = 86400;
const HOT = '#ff8a6a';                            // on the screen: killed / strike / sirens
const RED = '#7a2a10';                            // on the paper

const p = (lon: number, lat: number): [number, number] => [CX + (lon - C_LON) * K * SC, CY - (lat - C_LAT) * SC];
const bearingOf = (x: number, y: number) => (Math.atan2(x - CX, CY - y) + 2 * Math.PI) % (2 * Math.PI);
const inScope = (x: number, y: number) => (x - CX) ** 2 + (y - CY) ** 2 <= R * R;

type Place = [string, string, number, number, number, string, 0 | 1];
type Blip = { x: number; y: number; b: number; fire?: Fire; ac?: Aircraft; inc?: Incident; alert?: Alert; city?: string };

const n = (v: number) => v.toLocaleString('en-US');
const when = (t: number) => {
  const iso = new Date(t * 1000).toISOString();
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)}Z`;
};
const ago = (t: number) => {
  const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60));
  return m < 60 ? `${m} MIN AGO` : m < 1440 ? `${Math.round(m / 60)} H AGO` : `${Math.round(m / 1440)} D AGO`;
};
const hotInc = (x: Incident) => x.tags[0] === 'KILLED' || x.tags[0] === 'STRIKE';

type Props = { feed: RadarFeed | null; fires: Fire[] | null; incidents: Incident[]; alerts: Alert[] };

export function RadarScope(props: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  // the console polls in the background; the running scope picks the latest up next frame
  const live = useRef(props);
  useEffect(() => { live.current = props; });

  useEffect(() => {
    const cv = ref.current!;
    let geo: Geo | null = null, cities: Place[] = [];
    let seen: Props | null = null;
    let fireBlips: Blip[] = [], incBlips: Blip[] = [], alertBlips: Blip[] = [], airBlips: Blip[] = [];
    let hover: Blip | null = null;
    let alive = true;
    loadGeo().then(g => { geo = g; });
    fetch('/map/places.json').then(r => (r.ok ? r.json() : [])).then((ps: Place[]) => { if (alive) cities = ps.filter(x => x[4] === 0); }).catch(() => {});

    const blip = (lon: number, lat: number, extra: Partial<Blip>): Blip => {
      const [x, y] = p(lon, lat);
      return { x, y, b: bearingOf(x, y), ...extra };
    };
    const onAir = (e: Event) => {
      airBlips = (e as CustomEvent<Aircraft[]>).detail.filter(a => a.mil).map(ac => blip(ac.lon, ac.lat, { ac }));
    };
    window.addEventListener(AIR_EVENT, onAir);

    const stop = mountPlate(cv, W, H, ({ ctx, s, mono, t, line, grain }, now) => {
      const cur = live.current;
      if (seen !== cur) {
        seen = cur;
        fireBlips = (cur.fires ?? []).map(f => blip(f.lon, f.lat, { fire: f }));
        incBlips = cur.incidents.filter(x => x.place).map(x => blip(x.place!.lon, x.place!.lat, { inc: x }));
        alertBlips = cur.alerts.filter(a => Date.now() / 1000 - a.t < DAY)
          .flatMap(a => a.cities.map(c => blip(c.lon, c.lat, { alert: a, city: c.en })));
        if (hover && !hover.ac) hover = null;
      }
      const nowS = Date.now() / 1000;

      // ── the scope: dark only inside the ring ──────────────────────────────
      ctx.save();
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, 7); ctx.clip();
      ctx.fillStyle = SCREEN; ctx.fillRect(CX - R, CY - R, R * 2, R * 2);
      const vig = ctx.createRadialGradient(CX, CY, R * 0.3, CX, CY, R);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(10,16,8,0.5)');
      ctx.fillStyle = vig; ctx.fillRect(CX - R, CY - R, R * 2, R * 2);

      // the map, faint: coast, Gaza and the West Bank, the settlements, the cities
      if (geo) {
        ctx.beginPath(); rings(ctx, geo.coast, p, false);
        ctx.strokeStyle = SCREEN_DIM; ctx.lineWidth = 0.6; ctx.stroke();
        ctx.beginPath(); rings(ctx, [...geo.wb, ...geo.gaza], p);
        ctx.fillStyle = 'rgba(98,242,182,0.07)'; ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(98,242,182,0.4)'; ctx.lineWidth = 0.6; ctx.stroke();
        ctx.fillStyle = 'rgba(240,192,44,0.3)';
        for (const st of geo.sites) { const [x, y] = p(st.c[0], st.c[1]); ctx.fillRect(x - 0.4, y - 0.4, 0.8, 0.8); }
      }
      for (const c of cities) {
        const [x, y] = p(c[2], c[3]);
        ctx.fillStyle = SCREEN_DIM; ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
        t(c[0], x + 2.5, y + 1.5, 4, 'rgba(98,242,182,0.45)');
      }
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
        ctx.fillStyle = cg; ctx.fillRect(CX - R, CY - R, R * 2, R * 2);
      }
      line(CX, CY, CX + Math.sin(sweep) * R, CY - Math.cos(sweep) * R, TRACE, 1);
      const lit = (b: Blip) => Math.exp(-(((sweep - b.b) + 4 * Math.PI) % (2 * Math.PI)) * 0.9);
      const glow = (color: string, a: number, blur: number) => {
        ctx.globalAlpha = a; ctx.fillStyle = ctx.strokeStyle = color; ctx.lineWidth = 0.7;
        ctx.shadowColor = color; ctx.shadowBlur = blur * s * a;
      };
      const pulse = (x: number, y: number, r: number, color: string) => {
        const ph = (now / 1400) % 1;
        ctx.shadowBlur = 0; ctx.globalAlpha = 0.6 * (1 - ph); ctx.strokeStyle = color;
        ctx.beginPath(); ctx.arc(x, y, r + 2 + ph * 7, 0, 7); ctx.stroke();
      };
      const done = () => { ctx.shadowBlur = 0; ctx.globalAlpha = 1; };

      // ● fires: size by heat, solid for the last day
      for (const bl of fireBlips) {
        const f = bl.fire!, age = nowS - f.t, fresh = age < DAY, ours = f.region !== '';
        const r = Math.min(4, 1 + Math.sqrt(Math.max(0, f.frp)) * 0.45);
        glow(ours ? YEL : SCREEN_INK, bl === hover ? 1 : Math.max(fresh ? 0.6 : ours ? 0.3 : 0.15, lit(bl)), fresh ? 8 : 3);
        ctx.beginPath(); ctx.arc(bl.x, bl.y, r, 0, 7);
        if (fresh) ctx.fill(); else ctx.stroke();
        if (fresh && ours && age < 6 * HOUR) pulse(bl.x, bl.y, r, CORE);
        done();
      }
      // ▲ field reports: red for killings and strikes; the last 6 hours pulse
      for (const bl of incBlips) {
        const x = bl.inc!, age = nowS - x.t, color = hotInc(x) ? HOT : CORE;
        glow(color, bl === hover ? 1 : Math.max(age < 6 * HOUR ? 0.85 : age < DAY ? 0.55 : 0.25, lit(bl)), 7);
        ctx.beginPath(); ctx.moveTo(bl.x, bl.y - 2.6); ctx.lineTo(bl.x + 2.4, bl.y + 1.8); ctx.lineTo(bl.x - 2.4, bl.y + 1.8); ctx.closePath();
        if (x.tags.includes('SETTLERS') || hotInc(x)) ctx.fill(); else ctx.stroke();
        if (sourcesOf(x).length > 1) {   // confirmed by two channels or more: a second, outer triangle
          ctx.beginPath(); ctx.moveTo(bl.x, bl.y - 4.6); ctx.lineTo(bl.x + 4.1, bl.y + 2.9); ctx.lineTo(bl.x - 4.1, bl.y + 2.9); ctx.closePath(); ctx.stroke();
        }
        if (age < 6 * HOUR) pulse(bl.x, bl.y, 2.4, color);
        done();
      }
      // ◎ sirens, the last 24 hours
      for (const bl of alertBlips) {
        const age = nowS - bl.alert!.t;
        glow(HOT, bl === hover ? 1 : Math.max(age < HOUR ? 0.9 : 0.35, lit(bl)), 6);
        ctx.beginPath(); ctx.arc(bl.x, bl.y, 0.9, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(bl.x, bl.y, 2.6, 0, 7); ctx.stroke();
        if (age < HOUR) pulse(bl.x, bl.y, 2.6, HOT);
        done();
      }
      // ◇ military aircraft, live
      for (const bl of airBlips) {
        glow(YEL, bl === hover ? 1 : Math.max(0.6, lit(bl)), 6);
        ctx.beginPath(); ctx.moveTo(bl.x, bl.y - 2.6); ctx.lineTo(bl.x + 2.6, bl.y); ctx.lineTo(bl.x, bl.y + 2.6); ctx.lineTo(bl.x - 2.6, bl.y); ctx.closePath();
        ctx.stroke(); done();
        t(bl.ac!.type || 'MIL', bl.x + 4, bl.y + 1.5, 4.2, YEL);
      }
      if (hover) { ctx.strokeStyle = CORE; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(hover.x, hover.y, 5.5, 0, 7); ctx.stroke(); }
      grain(CX - R, CY - R, R * 2, R * 2);
      ctx.restore();

      // the rim and its bearings, on the paper
      ctx.strokeStyle = INK; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, 7); ctx.stroke();
      for (let d = 0; d < 360; d += 10) {
        const b = (d * Math.PI) / 180, sx = Math.sin(b), cy = -Math.cos(b), long = d % 30 === 0;
        line(CX + sx * R, CY + cy * R, CX + sx * (R + (long ? 4 : 2)), CY + cy * (R + (long ? 4 : 2)), INK);
        if (d % 90 === 0) t(['N', 'E', 'S', 'W'][d / 90], CX + sx * (R + 9), CY + cy * (R + 9) + 2, 5, INK, 'center');
      }

      // ── the corners, on the paper: title, counts, key ───────────────────────
      const recent = <T extends { t: number }>(xs: T[], h: number) => xs.filter(x => nowS - x.t < h * HOUR).length;
      const fires = (cur.fires ?? []).filter(f => f.region);
      t('[ TRACKING ]', X0, Y0 + 6, 8.5);
      t('GAZA / WEST BANK, 100 KM', X0, Y0 + 14, 4.5);
      const tally: [string, boolean][] = [
        [`FIELD REPORTS 24H ${recent(cur.incidents, 24)}`, recent(cur.incidents.filter(hotInc), 24) > 0],
        [`SIRENS 24H ${recent(cur.alerts, 24)}`, recent(cur.alerts, 24) > 0],
        [`SAT FIRES 24H ${recent(fires, 24)} / 7D ${fires.length}`, false],
        [`MIL AIRCRAFT NOW ${airBlips.length}`, false],
      ];
      tally.forEach(([r, red], i) => t(r, X0 + SCR, Y0 + 2 + i * 7, 5, red ? RED : INK, 'right'));
      const key: [string, (x: number, y: number) => void][] = [
        ['FIELD REPORT', (x, y) => { ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + 1.9, y + 1.4); ctx.lineTo(x - 1.9, y + 1.4); ctx.closePath(); ctx.fill(); }],
        ['SIRENS', (x, y) => { ctx.fillStyle = ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, y, 0.7, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.stroke(); }],
        ['SAT FIRE', (x, y) => { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 7); ctx.fill(); }],
        ['MIL AIRCRAFT', (x, y) => { ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + 2, y); ctx.lineTo(x, y + 2); ctx.lineTo(x - 2, y); ctx.closePath(); ctx.stroke(); }],
        ['DOUBLE = 2+ SOURCES', (x, y) => { ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x, y - 2.6); ctx.lineTo(x + 2.4, y + 1.8); ctx.lineTo(x - 2.4, y + 1.8); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y - 1.2); ctx.lineTo(x + 1.1, y + 0.8); ctx.lineTo(x - 1.1, y + 0.8); ctx.closePath(); ctx.stroke(); }],
        ['RED = KILLED/STRIKE', (x, y) => { ctx.fillStyle = RED; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }],
        ['PULSE = NEW', (x, y) => { ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 0.8, 0, 7); ctx.stroke(); }],
      ];
      key.forEach(([label, draw], i) => {
        const y = Y0 + SCR - 2 - (key.length - 1 - i) * 7.5;
        draw(X0 + 3, y - 1.8);
        t(label, X0 + 8, y, 4.5);
      });
      t(hover ? 'READING ↓' : 'HOVER A CONTACT', X0 + SCR, Y0 + SCR - 2, 4.5, INK, 'right');

      // ── the table: the hovered contact read out, else the running totals ─────
      const ty = Y0 + SCR + 8, th = TABLE_H - 20;
      ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.strokeRect(X0, ty, SCR, th);
      const rows = (xs: [string, string?][]) => xs.forEach(([r, c], i) => t(r, X0 + 6, ty + 12 + i * 9, i ? 5.5 : 6.5, c ?? INK));
      if (hover?.inc) {
        const x = hover.inc;
        rows([
          [x.tags.join(' / '), hotInc(x) ? RED : INK],
          [`${(x.place?.en ?? '').toUpperCase()}  ${when(x.t)}  (${ago(x.t)})`],
          [sourcesOf(x).length > 1 ? `CONFIRMED: ${sourcesOf(x).join(' + ')}. ${x.src}, AS POSTED:` : `${x.src} FIELD REPORT, AS POSTED:`],
        ]);
        // the report itself, Arabic, right to left, wrapped
        ctx.save();
        ctx.font = `600 7px 'Noto Naskh Arabic', 'Segoe UI', Tahoma, sans-serif`;
        ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = INK;
        let ln = '', y = ty + 48;
        for (const w of x.text.split(' ')) {
          if (ctx.measureText(`${ln} ${w}`).width > SCR - 14 && ln) {
            ctx.fillText(ln, X0 + SCR - 6, y); ln = w; y += 9;
            if (y > ty + th - 3) { ln = ''; break; }
          } else ln = ln ? `${ln} ${w}` : w;
        }
        if (ln) ctx.fillText(ln, X0 + SCR - 6, y);
        ctx.restore();
      } else if (hover?.alert) {
        const a = hover.alert;
        rows([
          [`SIRENS: ${a.threat}`, RED],
          [`${hover.city!.toUpperCase()}  ${when(a.t)}  (${ago(a.t)})`],
          [`${a.cities.length} PLACE${a.cities.length > 1 ? 'S' : ''}: ${a.cities.slice(0, 6).map(c => c.en.toUpperCase()).join(', ')}${a.cities.length > 6 ? '…' : ''}`.slice(0, 92)],
          ['TZEVA ADOM / ISRAELI HOME FRONT COMMAND'],
        ]);
      } else if (hover?.fire) {
        const f = hover.fire;
        rows([
          [`FIRE / HEAT  ${f.region || 'OUTSIDE PALESTINE'}`, f.region === 'GAZA' ? RED : INK],
          [`${when(f.t)}  (${ago(f.t)})`],
          [f.near ? `${f.near.km} KM ${f.near.dir} OF ${f.near.en.toUpperCase()}` : `${f.lat.toFixed(3)}N ${f.lon.toFixed(3)}E`],
          [`HEAT ${f.frp} MW  SATELLITE ${f.sat}  CONFIDENCE ${f.conf.toUpperCase()}`],
          ['NASA FIRMS VIIRS, ~375 M PIXEL'],
        ]);
      } else if (hover?.ac) {
        const a = hover.ac;
        rows([
          [`MILITARY ${a.type || '?'}  ${a.flight || a.reg || a.hex}`],
          [`${a.alt == null ? 'ALT ---' : a.alt === 0 ? 'ON GROUND' : `${a.alt} FT`}  ${Math.round(a.gs)} KT  HDG ${Math.round(a.track)}`],
          [`${a.lat.toFixed(3)}N ${a.lon.toFixed(3)}E  REG ${a.reg || '?'}  HEX ${a.hex}`],
          ['ADS-B, LIVE'],
        ]);
      } else if (cur.feed) {
        const { gaza: gz, westBank: wb, lebanon: lb } = cur.feed.summary;
        const cols: [string, string[]][] = [
          ['WEST BANK', [`KILLED ${n(wb.killed)}`, `CHILDREN ${n(wb.children)}`, `INJURED ${n(wb.injured)}`, `SETTLER ATK ${n(wb.attacks)}`, `DISPLACED ${n(wb.displaced)}`, `UPD ${wb.updated}`]],
          ['GAZA', [`KILLED ${n(gz.killed)}`, `CHILDREN ${n(gz.children)}`, `WOMEN ${n(gz.women)}`, `MEDICS ${n(gz.medical)} PRESS ${n(gz.press)}`, `INJURED ${n(gz.injured)}`, `UPD ${gz.updated}`]],
          ['LEBANON', [`KILLED ${n(lb.killed)}`, `INJURED ${n(lb.injured)}`, `SINCE ${lb.since}`, `UPD ${lb.updated}`, '', '> SINCE 2023-10-07 <']],
        ];
        const cw = SCR / 3;
        cols.forEach(([head, rs], i) => {
          const x = X0 + i * cw + 6;
          if (i) line(X0 + i * cw, ty + 6, X0 + i * cw, ty + th - 6, INK);
          ctx.font = `700 5px ${mono}`;
          const hw = ctx.measureText(head).width + 10;
          ctx.strokeStyle = INK; ctx.strokeRect(x, ty + 6, hw, 8);
          t(head, x + 5, ty + 12, 5);
          rs.forEach((r, j) => t(r, x, ty + 24 + j * 9, 5.5));
        });
      } else t('FEED UNREACHABLE — RETRYING', CX, ty + 40, 6.5, INK, 'center');
      t('SRC WAFA / MA\'AN / QNN / TZEVA ADOM / NASA FIRMS / ADS-B / OCHA + MOH VIA TFP / OSM', X0, H - 3, 5);
    });

    const pick = (e: PointerEvent) => {
      const { x: px, y: py } = platePoint(cv, W, H, e);
      if (!inScope(px, py)) { hover = null; return; }
      let best: Blip | null = null, bd = 36;   // within 6 units; field reports and sirens win ties
      for (const b of [...airBlips, ...fireBlips, ...alertBlips, ...incBlips]) {
        const d = (b.x - px) ** 2 + (b.y - py) ** 2;
        if (d <= bd) { bd = d; best = b; }
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

  const placed = props.incidents.filter(x => x.place);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`Radar map of Gaza and the West Bank: ${props.incidents.length} field reports (WAFA, Ma'an, Quds News Network) in the past 72 hours${
        placed.length ? `, latest ${placed.at(-1)!.tags.join(' ').toLowerCase()} in ${placed.at(-1)!.place!.en}` : ''}; ${
        (props.fires ?? []).filter(f => f.region).length} satellite fire detections in 7 days; siren alerts and live military aircraft.`}
      className="plate radar"
      style={{ aspectRatio: `${W} / ${H}`, touchAction: 'manipulation' }}
    />
  );
}
