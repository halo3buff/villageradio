/**
 * The console's map layers (public/map/geo.json, built by scripts/build-map.py),
 * loaded once and shared, plus a fitted lon/lat → plate-unit projection.
 */

type Ring = [number, number][];
export type Site = { n: string; t: number; y: number | null; ej?: 1; c: [number, number]; p: Ring[] };
export type Geo = {
  wb: Ring[]; gaza: Ring[]; coast: Ring[];
  areaA: Ring[]; areaB: Ring[]; juris: Ring[]; barrier: Ring[];
  types: string[]; sites: Site[];
  stats: { areaC: number; juris: number };
};

let pending: Promise<Geo | null> | null = null;
export const loadGeo = () => (pending ??= fetch('/map/geo.json').then(r => (r.ok ? r.json() : null)).catch(() => null));

/** Fit a lon/lat box into a screen rect, centred, with lon shrunk by cos(lat) so shapes stay true. */
export function fit(box: { w: number; e: number; s: number; n: number }, x: number, y: number, w: number, h: number) {
  const k = Math.cos((((box.s + box.n) / 2) * Math.PI) / 180);
  const sc = Math.min(w / ((box.e - box.w) * k), h / (box.n - box.s));
  const ox = x + (w - (box.e - box.w) * k * sc) / 2, oy = y + (h - (box.n - box.s) * sc) / 2;
  return {
    sc,   // plate units per degree of latitude
    p: (lon: number, lat: number): [number, number] => [ox + (lon - box.w) * k * sc, oy + (box.n - lat) * sc],
  };
}

/** Trace rings into the current path. */
export function rings(ctx: CanvasRenderingContext2D, rs: Ring[], p: (lon: number, lat: number) => [number, number], close = true) {
  for (const r of rs) {
    r.forEach(([lon, lat], i) => {
      const [x, y] = p(lon, lat);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    if (close) ctx.closePath();
  }
}

export function extent(rs: Ring[]) {
  const b = { w: Infinity, e: -Infinity, s: Infinity, n: -Infinity };
  for (const r of rs) for (const [lon, lat] of r) {
    b.w = Math.min(b.w, lon); b.e = Math.max(b.e, lon); b.s = Math.min(b.s, lat); b.n = Math.max(b.n, lat);
  }
  return b;
}
