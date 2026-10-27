import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Fires and heat seen from orbit over Gaza and the West Bank: NASA FIRMS' VIIRS
 * detections (three satellites, ~375 m pixels, each pass online within ~3 h), from
 * the open 7-day global files — no key. Every detection gets its region and the
 * nearest Palestinian town (public/map/places.json, built by scripts/build-places.py).
 * Over Gaza most are strike fires; over the West Bank, field, grove and village fires.
 */

const FILES = [
  'suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_7d.csv',
  'noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_7d.csv',
  'noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_7d.csv',
];
const BASE = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/';
export const FIRE_BOX = { w: 34.15, e: 35.7, s: 31.15, n: 32.65 };
const EVERY = 3600_000;   // the files gain a pass every few hours; an hourly look is plenty

export type Region = 'GAZA' | 'WEST BANK' | '';
export type Fire = {
  lat: number; lon: number;
  t: number;              // unix seconds, the satellite pass
  frp: number;            // fire radiative power, MW: how much heat
  sat: string; conf: string;
  region: Region;
  near: { en: string; ar: string; km: number; dir: string } | null;
};

type Ring = [number, number][];
export type Place = [en: string, ar: string, lon: number, lat: number, rank: number, gov: string, gaza: 0 | 1];

/** Even-odd point in polygon over all rings (holes included). */
export function inside(rings: Ring[], lon: number, lat: number) {
  let hit = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** The nearest place to a point: its names, the distance and the point's direction from it. */
export function nearest(places: Place[], lon: number, lat: number): Fire['near'] {
  const k = Math.cos((lat * Math.PI) / 180);
  let best: Place | null = null, bd = Infinity;
  for (const p of places) {
    const d = ((p[2] - lon) * k) ** 2 + (p[3] - lat) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) return null;
  const dx = (lon - best[2]) * k, dy = lat - best[3];
  const dir = DIRS[Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 / 45) % 8];
  return { en: best[0], ar: best[1], km: Math.round(Math.sqrt(bd) * 111 * 10) / 10, dir };
}

/** One FIRMS CSV row → a fire inside the box, else null. */
export function row(line: string): Omit<Fire, 'region' | 'near'> | null {
  const c = line.split(',');
  const lat = +c[0], lon = +c[1];
  if (!(lat >= FIRE_BOX.s && lat <= FIRE_BOX.n && lon >= FIRE_BOX.w && lon <= FIRE_BOX.e)) return null;
  const [date, hhmm] = [c[5], c[6].padStart(4, '0')];
  return {
    lat, lon, frp: +c[11], sat: c[7], conf: c[8],
    t: Date.parse(`${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`) / 1000,
  };
}

async function scan(file: string) {
  const r = await fetch(BASE + file, { cache: 'no-store', headers: { 'User-Agent': 'vlgfm.live radar console (+https://vlgfm.live)' } });
  if (!r.ok || !r.body) throw new Error(`firms ${file} ${r.status}`);
  // ~40 MB each: read it as a stream, keep only the rows in the box
  const out: Omit<Fire, 'region' | 'near'>[] = [];
  const dec = new TextDecoder();
  let rest = '';
  for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
    const lines = (rest + dec.decode(chunk, { stream: true })).split('\n');
    rest = lines.pop()!;
    for (const l of lines) { const f = row(l); if (f) out.push(f); }
  }
  const f = row(rest);
  if (f) out.push(f);
  return out;
}

let maps: Promise<{ wb: Ring[]; gaza: Ring[]; places: Place[] }> | null = null;
const loadMaps = () => (maps ??= (async (): Promise<{ wb: Ring[]; gaza: Ring[]; places: Place[] }> => {
  const dir = path.join(process.cwd(), 'public', 'map');
  const geo = JSON.parse(await readFile(path.join(dir, 'geo.json'), 'utf8'));
  return { wb: geo.wb, gaza: geo.gaza, places: JSON.parse(await readFile(path.join(dir, 'places.json'), 'utf8')) as Place[] };
})());

// ponytail: per-instance memory, refetched hourly per instance; a FIRMS MAP_KEY's area API
// (a few KB per call) is the upgrade if the 3 × 40 MB pulls ever matter.
let last: { at: number; fires: Fire[] } | null = null;
let inflight: Promise<void> | null = null;

async function refresh() {
  const [m, ...files] = await Promise.all([loadMaps(), ...FILES.map(scan)]);
  last = {
    at: Date.now(),
    fires: files.flat()
      .map(f => {
        const region: Region = inside(m.gaza, f.lon, f.lat) ? 'GAZA' : inside(m.wb, f.lon, f.lat) ? 'WEST BANK' : '';
        return { ...f, region, near: region ? nearest(m.places.filter(p => p[6] === (region === 'GAZA' ? 1 : 0)), f.lon, f.lat) : null };
      })
      .sort((a, b) => a.t - b.t),
  };
}

/** The past 7 days of detections in the box, oldest first; the last good set if FIRMS is down. */
export async function getFires(): Promise<Fire[] | null> {
  if (!last || Date.now() - last.at >= EVERY) {
    inflight ??= refresh().catch(e => console.error('fires', e)).finally(() => { inflight = null; });
    // a cold start waits; after that, a stale set is served while the refresh runs
    if (!last) await inflight;
  }
  return last?.fires ?? null;
}

/** The teleprinter's lines: one per pass per place in Gaza or the West Bank, hottest heat given. */
export function fireLines(fires: Fire[]): { t: number; text: string }[] {
  const by = new Map<string, { f: Fire; n: number; frp: number }>();
  for (const f of fires) {
    if (!f.region) continue;
    const k = `${f.t} ${f.near?.en ?? `${f.lat.toFixed(2)},${f.lon.toFixed(2)}`}`;
    const g = by.get(k);
    if (g) { g.n++; g.frp = Math.max(g.frp, f.frp); } else by.set(k, { f, n: 1, frp: f.frp });
  }
  return [...by.values()].map(({ f, n, frp }) => {
    const iso = new Date(f.t * 1000).toISOString();
    const where = f.near ? `${f.near.km}KM ${f.near.dir} ${f.near.en.slice(0, 16)}` : `${f.lat.toFixed(2)}N ${f.lon.toFixed(2)}E`;
    return {
      t: f.t,
      text: `${iso.slice(2, 10).replace(/-/g, '.')} ${iso.slice(11, 16)}Z FIRE ${f.region === 'GAZA' ? 'GAZA' : 'W.BANK'} ${where.toUpperCase()}${n > 1 ? ` x${n}` : ''} ${Math.round(frp * 10) / 10}MW`,
    };
  });
}
