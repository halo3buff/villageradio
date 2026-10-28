'use client';

import { useEffect, useRef } from 'react';
import { CORE, INK, mountPlate, platePoint, reach, SCREEN_DIM, SCREEN_INK, YEL } from './plateKit';
import { extent, fit, loadGeo, rings, type Geo, type Site } from './geo';

/**
 * The settlement map — the West Bank as Peace Now surveys it: Oslo's Areas A
 * and B lit, Area C (full Israeli control) in amber wash, settlement council
 * jurisdictions, the separation barrier, and every settlement, outpost and
 * farm outpost, as of Peace Now's latest survey. The newest year's sites pulse.
 * Hover a site to read it.
 */

export const W = 260, H = 446;
const X0 = 10, Y0 = 22, SW = 240, SH = 328;
const SURVEY = '14.11.2024';   // Peace Now's layer date (see scripts/build-map.py)
const NEWEST = 2024;

const SETTLEMENT = 0, OUTPOST = 1, FARM = 2, INDUSTRIAL = 3;

export function SettlementMap() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    let geo: Geo | null | undefined;
    let proj: ReturnType<typeof fit> | null = null;
    let hover: Site | null = null;
    let alive = true;
    loadGeo().then(g => {
      if (!alive) return;
      geo = g;
      if (g) {
        const b = extent(g.wb);
        // the map sits right of centre; the legend and counters take the left
        proj = fit({ w: b.w - 0.02, e: b.e + 0.02, s: b.s - 0.02, n: b.n + 0.02 }, X0 + 70, Y0 + 22, SW - 76, SH - 30);
      }
    });

    const stop = mountPlate(cv, W, H, ({ ctx, s, t, line, screen, grain }, now) => {
      screen(X0, Y0, SW, SH);
      t(geo === null ? '[ NO MAP ]' : '[ SETTLEMENTS ]', X0 + 6, Y0 + 13, 8.5, SCREEN_INK);

      const pulse = 0.5 + 0.5 * Math.sin(now / 400);

      if (geo && proj) {
        const { p } = proj;
        const fill = (rs: Geo['wb'], color: string) => {
          ctx.beginPath(); rings(ctx, rs, p); ctx.fillStyle = color; ctx.fill('evenodd');
        };
        fill(geo.wb, 'rgba(240,192,44,0.10)');          // all of it Area C, until A and B are laid over
        fill(geo.areaB, 'rgba(230,230,230,0.16)');
        fill(geo.areaA, 'rgba(230,230,230,0.34)');
        fill(geo.juris, 'rgba(240,192,44,0.16)');
        ctx.beginPath(); rings(ctx, geo.barrier, p, false);
        ctx.strokeStyle = CORE; ctx.lineWidth = 0.6; ctx.setLineDash([2, 1.5]); ctx.globalAlpha = 0.7; ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.beginPath(); rings(ctx, geo.wb, p);
        ctx.strokeStyle = SCREEN_INK; ctx.lineWidth = 0.8; ctx.stroke();

        for (const x of geo.sites) {
          const fresh = x.y === NEWEST;
          const [cx, cy] = p(x.c[0], x.c[1]);
          ctx.fillStyle = ctx.strokeStyle = YEL; ctx.lineWidth = 0.6;
          ctx.shadowColor = YEL; ctx.shadowBlur = fresh || x === hover ? 8 * s : 0;
          ctx.globalAlpha = x === hover ? 1 : 0.85;
          ctx.beginPath();
          if ((x.t === SETTLEMENT || x.t === INDUSTRIAL) && x.p.length) {
            rings(ctx, x.p, p);
            if (x.t === SETTLEMENT) ctx.fill(); else ctx.stroke();
          } else if (x.t === OUTPOST) {
            ctx.moveTo(cx, cy - 1.6); ctx.lineTo(cx + 1.4, cy + 1); ctx.lineTo(cx - 1.4, cy + 1); ctx.closePath(); ctx.stroke();
          } else if (x.t === FARM) {
            ctx.rect(cx - 0.8, cy - 0.8, 1.6, 1.6); ctx.fill();
          } else {
            ctx.arc(cx, cy, 0.8, 0, 7); ctx.fill();
          }
          if (fresh) {
            ctx.globalAlpha = 0.3 + 0.7 * pulse;
            ctx.beginPath(); ctx.arc(cx, cy, 2.5 + pulse * 1.5, 0, 7); ctx.strokeStyle = CORE; ctx.stroke();
          }
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        }

        // ── the left column: survey date, counts, legend ──────────────────
        const count = (k: number) => geo!.sites.filter(x => x.t === k).length;
        t(SURVEY, X0 + 8, Y0 + 40, 9, SCREEN_INK);
        t('LATEST SURVEY', X0 + 8, Y0 + 48, 4.5, SCREEN_DIM);
        t(`◎ FOUNDED ${NEWEST}`, X0 + 8, Y0 + 57, 4.5, CORE);
        [[`SETTLEMENTS`, count(SETTLEMENT)], ['OUTPOSTS', count(OUTPOST)], ['FARMS', count(FARM)], ['INDUSTRIAL', count(INDUSTRIAL)]]
          .forEach(([k, v], i) => {
            t(String(v), X0 + 8, Y0 + 76 + i * 17, 9, SCREEN_INK);
            t(String(k), X0 + 8, Y0 + 83 + i * 17, 4.5, SCREEN_DIM);
          });

        const ly = Y0 + SH - 74;
        const key = (i: number, label: string, draw: (x: number, y: number) => void) => {
          draw(X0 + 10, ly + i * 9 - 2);
          t(label, X0 + 17, ly + i * 9, 4.5, SCREEN_INK);
        };
        const swatch = (c: string) => (x: number, y: number) => { ctx.fillStyle = c; ctx.fillRect(x - 2.5, y - 2, 5, 4); };
        key(0, 'AREA A', swatch('rgba(230,230,230,0.5)'));
        key(1, 'AREA B', swatch('rgba(230,230,230,0.25)'));
        key(2, 'AREA C', swatch('rgba(240,192,44,0.25)'));
        key(3, 'JURISDICTION', swatch('rgba(240,192,44,0.45)'));
        key(4, 'BARRIER', (x, y) => { ctx.setLineDash([2, 1.5]); line(x - 3, y, x + 3, y, CORE); ctx.setLineDash([]); });
        key(5, 'SETTLEMENT', swatch(YEL));
        key(6, 'OUTPOST', (x, y) => {
          ctx.strokeStyle = YEL; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(x, y - 1.6); ctx.lineTo(x + 1.4, y + 1); ctx.lineTo(x - 1.4, y + 1); ctx.closePath(); ctx.stroke();
        });
        key(7, 'FARM OUTPOST', (x, y) => { ctx.fillStyle = YEL; ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6); });

        if (hover) {
          const h = hover;
          t(h.n, X0 + SW - 6, Y0 + SH - 18, 5.5, CORE, 'right');
          t(`${geo.types[h.t]}  ${h.y ? `FOUNDED ${h.y}` : h.ej ? 'E. JERUSALEM' : ''}`, X0 + SW - 6, Y0 + SH - 10, 4.5, SCREEN_INK, 'right');
        }
      }
      grain(X0, Y0, SW, SH);

      // ── the table ─────────────────────────────────────────────────────────
      const ty = Y0 + SH + 8;
      ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.strokeRect(X0, ty, SW, 76);
      if (geo) {
        const n = (k: number) => geo!.sites.filter(x => x.t === k).length;
        const since = (y: number) => geo!.sites.filter(x => x.y != null && x.y >= y && x.t !== INDUSTRIAL).length;
        const cols = [
          [`SETTLEMENTS ${n(SETTLEMENT)}`, `OUTPOSTS ${n(OUTPOST)}`, `FARM OUTPOSTS ${n(FARM)}`, `INDUSTRIAL ${n(INDUSTRIAL)}`, `TOTAL SITES ${geo.sites.length}`],
          [`AREA C ${geo.stats.areaC}%`, '  (OSLO II LINES, 1995)', `JURISDICTION ${geo.stats.juris}%`, `NEW SINCE 2020 ${since(2020)}`, `NEW 2023-24 ${since(2023)}`],
        ];
        cols.forEach((rows, i) => {
          if (i) line(X0 + SW / 2, ty + 6, X0 + SW / 2, ty + 70, INK);
          rows.forEach((r, j) => t(r, X0 + 6 + (i * SW) / 2, ty + 14 + j * 12, 5.5));
        });
      } else t(geo === null ? 'MAP DATA UNREACHABLE' : 'LOADING..', X0 + SW / 2, ty + 40, 6.5, INK, 'center');
      t('SRC PEACE NOW (11.2024) / OCHA COD-AB', X0, H - 3, 5);
    });

    const pick = (e: PointerEvent) => {
      if (!geo || !proj) return;
      const { x: px, y: py } = platePoint(cv, W, H, e);
      let best: Site | null = null, bd = reach(e, 25);   // within 5 units
      for (const x of geo.sites) {
        const [cx, cy] = proj.p(x.c[0], x.c[1]);
        const d = (cx - px) ** 2 + (cy - py) ** 2;
        if (d < bd) { bd = d; best = x; }
      }
      hover = best;
    };
    cv.addEventListener('pointermove', pick);
    cv.addEventListener('pointerdown', pick);
    const drop = () => { hover = null; };   // a scroll that began here: not a pick
    cv.addEventListener('pointercancel', drop);
    return () => { alive = false; stop(); cv.removeEventListener('pointermove', pick); cv.removeEventListener('pointerdown', pick); cv.removeEventListener('pointercancel', drop); };
  }, []);

  return (
    <canvas
      ref={ref}
      className="plate map"
      role="img"
      aria-label="Map of the West Bank: Oslo Areas A, B and C, settlement jurisdictions, the separation barrier, and Israeli settlements, outposts and farm outposts by year founded, from Peace Now data."
      style={{ aspectRatio: `${W} / ${H}`, touchAction: 'manipulation' }}
    />
  );
}
