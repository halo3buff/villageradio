'use client';

import { useEffect, useRef } from 'react';
import { AIR_BOX, FIX_EVERY, type Aircraft } from '@/lib/air';
import { CORE, INK, mountPlate, platePoint, SCREEN_DIM, SCREEN_INK, TRACE, YEL } from './plateKit';
import { fit, loadGeo, rings, type Geo } from './geo';
import { telex } from './Teleprinter';

/**
 * The airspace scope — every aircraft broadcasting ADS-B over Gaza, the West
 * Bank and Israel: the server's latest fix, dead-reckoned between fixes, an
 * air-traffic display: a box per contact, a one-minute leader along its
 * track, a fading trail, and a data block (callsign, flight level, type).
 * Military-registered airframes in amber. Only what transponds shows up —
 * strike aircraft and drones mostly don't, and the table says so.
 */

export const W = 260, H = 446;
const X0 = 10, Y0 = 22, SW = 240, SH = 328;
const POLL = FIX_EVERY;     // asks the server for its latest fix as often as it takes one
const TRAIL = 30;          // positions kept per contact

/** Each new fix's aircraft, for the radar to plot the military ones. */
export const AIR_EVENT = 'vlg:air';

type Track ={ a: Aircraft; at: number; trail: [number, number][] };

const name = (a: Aircraft) => a.flight || a.reg || a.hex;
const fl = (a: Aircraft) => (a.alt == null ? '---' : a.alt === 0 ? 'GND' : `FL${String(Math.round(a.alt / 100)).padStart(3, '0')}`);

export function Airspace() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const { p, sc } = fit(AIR_BOX, X0 + 8, Y0 + 20, SW - 16, SH - 30);
    const tracks = new Map<string, Track>();
    let geo: Geo | null = null;
    let ok: boolean | null = null;      // null = first poll pending
    let fixT = 0;                       // when the server's latest fix was taken (epoch ms)
    let hover: Track | null = null;
    let alive = true;
    loadGeo().then(g => { geo = g; });

    const poll = async () => {
      try {
        const r = await fetch('/api/radar/air', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        ok = r.ok && Array.isArray(j.ac);
        if (!ok || j.t === fixT) return;
        fixT = j.t;
        window.dispatchEvent(new CustomEvent(AIR_EVENT, { detail: j.ac }));
        // the fix's moment on this page's clock, so dead reckoning starts from when it was taken
        const now = performance.now() - Math.max(0, Date.now() - j.t);
        const seen = new Set<string>();
        for (const a of j.ac as Aircraft[]) {
          seen.add(a.hex);
          if (a.mil && !tracks.has(a.hex)) {
            telex(`MIL ${a.type || '?'} ${name(a)} ${fl(a)} ${a.lat.toFixed(2)}N ${a.lon.toFixed(2)}E HDG ${Math.round(a.track)}`, 'air', true);
          }
          const tr = tracks.get(a.hex) ?? { a, at: now, trail: [] };
          tr.trail.push([a.lon, a.lat]);
          if (tr.trail.length > TRAIL) tr.trail.shift();
          tr.a = a; tr.at = now;
          tracks.set(a.hex, tr);
        }
        for (const [k, tr] of tracks) {
          if (seen.has(k)) continue;
          if (tr.a.mil) telex(`LOST CONTACT ${tr.a.type || '?'} ${name(tr.a)}`, 'air');
          tracks.delete(k);
        }
      } catch {
        if (alive) ok = false;
      }
    };
    poll();
    const iv = setInterval(poll, POLL);

    // where a contact is now: its last fix carried along its track at its ground speed
    const at = (tr: Track, now: number): [number, number] => {
      const nm = (tr.a.gs * Math.min(now - tr.at, FIX_EVERY + 60000)) / 3.6e6;
      const r = (tr.a.track * Math.PI) / 180;
      return [tr.a.lon + (nm * Math.sin(r)) / (60 * Math.cos((tr.a.lat * Math.PI) / 180)), tr.a.lat + (nm * Math.cos(r)) / 60];
    };

    const stop = mountPlate(cv, W, H, ({ ctx, s, t, line, screen, grain }, now) => {
      screen(X0, Y0, SW, SH);
      t(ok === false ? '[ NO FEED ]' : '[ AIRSPACE ]', X0 + 6, Y0 + 13, 8.5, SCREEN_INK);
      // the fix's age, counting up until the next lands
      const age = fixT ? Math.max(0, Math.floor((Date.now() - fixT) / 1000)) : 0;
      const fresh = ok && fixT && age * 1000 < FIX_EVERY + POLL;
      t(fixT ? `ADS-B / FIX ${Math.floor(age / 60)}:${String(age % 60).padStart(2, '0')}` : 'ADS-B', X0 + SW - 12, Y0 + 13, 5.5, SCREEN_INK, 'right');
      if (fresh && Math.floor(now / 600) % 2 === 0) { ctx.fillStyle = CORE; ctx.beginPath(); ctx.arc(X0 + SW - 7, Y0 + 11, 1.5, 0, 7); ctx.fill(); }

      // graticule every half degree
      ctx.setLineDash([1, 3]);
      for (let lon = 34; lon <= 36; lon += 0.5) {
        const [x] = p(lon, 0); line(x, Y0 + 20, x, Y0 + SH - 10, SCREEN_DIM, 0.5);
        t(`${lon.toFixed(1)}E`, x + 1.5, Y0 + SH - 12, 4, SCREEN_DIM);
      }
      for (let lat = 31; lat <= 33.4; lat += 0.5) {
        const [, y] = p(0, lat); line(X0 + 8, y, X0 + SW - 8, y, SCREEN_DIM, 0.5);
        t(`${lat.toFixed(1)}N`, X0 + SW - 9, y - 1.5, 4, SCREEN_DIM, 'right');
      }
      ctx.setLineDash([]);

      if (geo) {
        ctx.beginPath(); rings(ctx, geo.coast, p, false);
        ctx.strokeStyle = SCREEN_INK; ctx.lineWidth = 0.7; ctx.stroke();
        ctx.beginPath(); rings(ctx, [...geo.wb, ...geo.gaza], p);
        ctx.fillStyle = 'rgba(230,230,230,0.14)'; ctx.fill('evenodd');
        ctx.strokeStyle = TRACE; ctx.lineWidth = 0.7; ctx.stroke();
        const [gx, gy] = p(34.05, 31.42), [wx, wy] = p(35.42, 32.05);
        t('GAZA', gx, gy, 4.5, SCREEN_INK, 'right');
        t('WEST BANK', wx, wy, 4.5, SCREEN_INK);
      }

      // the contacts
      const list = [...tracks.values()];
      for (const tr of list) {
        const a = tr.a, color = a.mil ? YEL : TRACE;
        const [x, y] = p(...at(tr, now));
        // trail: the fixes it has reported, fading back
        tr.trail.forEach(([lon, lat], i) => {
          const [tx, ty] = p(lon, lat);
          ctx.globalAlpha = (0.5 * (i + 1)) / tr.trail.length;
          ctx.fillStyle = color; ctx.fillRect(tx - 0.4, ty - 0.4, 0.8, 0.8);
        });
        ctx.globalAlpha = 1;
        // leader: where it'll be in a minute
        const r = (a.track * Math.PI) / 180, d = (a.gs / 60 / 60) * sc;
        line(x, y, x + Math.sin(r) * d, y - Math.cos(r) * d, color, 0.6);
        ctx.strokeStyle = color; ctx.lineWidth = tr === hover ? 1.1 : 0.7;
        ctx.shadowColor = color; ctx.shadowBlur = 5 * s;
        ctx.beginPath();
        if (a.mil) { ctx.moveTo(x, y - 2.2); ctx.lineTo(x + 2.2, y); ctx.lineTo(x, y + 2.2); ctx.lineTo(x - 2.2, y); ctx.closePath(); }
        else ctx.rect(x - 1.4, y - 1.4, 2.8, 2.8);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // data block
        const fl = a.alt == null ? '---' : a.alt === 0 ? 'GND' : String(Math.round(a.alt / 100)).padStart(3, '0');
        t(a.flight || a.reg || a.hex, x + 3.5, y - 2.5, 4.2, a.mil ? YEL : SCREEN_INK);
        t(`${fl} ${a.mil ? 'MIL ' : ''}${a.type}`, x + 3.5, y + 2.5, 3.8, a.mil ? YEL : SCREEN_DIM);
      }

      t('□ CIVIL   ◇ MILITARY   — 1 MIN', X0 + 6, Y0 + SH - 4, 4.5, SCREEN_INK);
      if (hover && tracks.has(hover.a.hex)) {
        const a = hover.a;
        t(`${a.flight || '(NO CALLSIGN)'} ${a.reg} ${a.type}`, X0 + SW - 6, Y0 + 28, 5, CORE, 'right');
        t(`${a.alt == null ? '' : `${a.alt} FT `}${Math.round(a.gs)} KT ${Math.round(a.track)}°${a.mil ? ' MILITARY' : ''}`, X0 + SW - 6, Y0 + 35, 4.5, SCREEN_INK, 'right');
      }
      grain(X0, Y0, SW, SH);

      // ── the table ─────────────────────────────────────────────────────────
      const ty = Y0 + SH + 8;
      ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.strokeRect(X0, ty, SW, 76);
      const mil = list.filter(tr => tr.a.mil);
      t(`CONTACTS ${list.length}`, X0 + 6, ty + 14, 5.5);
      t(`MILITARY ${mil.length}`, X0 + 6, ty + 26, 5.5, mil.length ? '#7a2a10' : INK);
      mil.slice(0, 3).forEach((tr, i) => {
        const a = tr.a;
        t(`${a.type || '?'} ${a.flight || a.reg || a.hex} ${a.alt ? `FL${Math.round(a.alt / 100)}` : ''}`, X0 + 6, ty + 38 + i * 10, 5);
      });
      line(X0 + SW / 2, ty + 6, X0 + SW / 2, ty + 70, INK);
      ['TRANSPONDER CONTACTS', 'ONLY. STRIKE AIRCRAFT', 'AND MOST DRONES FLY', 'WITHOUT BROADCASTING,', 'SO DO NOT SHOW HERE.']
        .forEach((r, i) => t(r, X0 + SW / 2 + 6, ty + 14 + i * 12, 5));
      t('SRC ADSB.FI (HTTPS://ADSB.FI) / NAT. EARTH', X0, H - 3, 5);
    });

    const pick = (e: PointerEvent) => {
      const { x: px, y: py } = platePoint(cv, W, H, e);
      const now = performance.now();
      let best: Track | null = null, bd = 36;
      for (const tr of tracks.values()) {
        const [x, y] = p(...at(tr, now));
        const d = (x - px) ** 2 + (y - py) ** 2;
        if (d < bd) { bd = d; best = tr; }
      }
      hover = best;
    };
    cv.addEventListener('pointermove', pick);
    cv.addEventListener('pointerdown', pick);
    return () => { alive = false; clearInterval(iv); stop(); cv.removeEventListener('pointermove', pick); cv.removeEventListener('pointerdown', pick); };
  }, []);

  return (
    <canvas
      ref={ref}
      className="plate air"
      role="img"
      aria-label="Live air traffic over Gaza, the West Bank and Israel from public ADS-B transponder data; military-registered aircraft highlighted."
      style={{ aspectRatio: `${W} / ${H}`, touchAction: 'manipulation' }}
    />
  );
}
