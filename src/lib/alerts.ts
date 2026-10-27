/**
 * Siren alerts in Israel — rockets, drones, infiltrations — from Tzeva Adom's public
 * feed, seconds after the Home Front Command sounds them. Where sirens sound is where
 * a launch from Gaza, Lebanon or further was headed, and launch areas are often struck
 * back within minutes, so they're a short-range signal of what comes next. Cities are
 * placed with Tzeva Adom's own city list.
 */

const API = 'https://api.tzevaadom.co.il';
const UA = 'vlgfm.live radar console (+https://vlgfm.live)';
const POLL = 15_000;

const THREAT: Record<number, string> = { 0: 'ROCKETS', 2: 'INFILTRATION', 5: 'DRONE' };

export type Alert = { id: string; t: number; threat: string; cities: { en: string; lat: number; lon: number }[] };

type City = { en: string; lat: number; lng: number };
let cities: Promise<Record<string, City>> | null = null;
const loadCities = () => (cities ??= fetch('https://www.tzevaadom.co.il/static/cities.json', { headers: { 'User-Agent': UA }, next: { revalidate: 86400 } })
  .then(r => (r.ok ? r.json() : Promise.reject(new Error(`cities ${r.status}`))))
  .then(j => j.cities as Record<string, City>)
  .catch(e => { cities = null; throw e; }));

type Group = { id: number; alerts: { time: number; cities: string[]; threat: number; isDrill: boolean }[] };

/** Alert groups → one alert per group and threat, drills dropped, cities placed. */
export function toAlerts(groups: Group[], table: Record<string, City>): Alert[] {
  return groups.flatMap(g => {
    const by = new Map<number, Alert>();
    for (const a of g.alerts) {
      if (a.isDrill) continue;
      const x = by.get(a.threat) ?? { id: `${g.id}-${a.threat}`, t: a.time, threat: THREAT[a.threat] ?? 'ALERT', cities: [] };
      x.t = Math.min(x.t, a.time);
      for (const c of a.cities) {
        const k = table[c];
        if (k && !x.cities.some(y => y.en === k.en)) x.cities.push({ en: k.en, lat: k.lat, lon: k.lng });
      }
      by.set(a.threat, x);
    }
    return [...by.values()];
  }).sort((a, b) => a.t - b.t);
}

let last: { at: number; alerts: Alert[] } | null = null;
let inflight: Promise<void> | null = null;

async function refresh() {
  const [r, table] = await Promise.all([fetch(`${API}/alerts-history`, { cache: 'no-store', headers: { 'User-Agent': UA } }), loadCities()]);
  if (!r.ok) throw new Error(`tzevaadom ${r.status}`);
  last = { at: Date.now(), alerts: toAlerts(await r.json(), table) };
}

/** Recent alerts (Tzeva Adom keeps the last 50 groups), oldest first; empty if unreachable. */
export async function getAlerts(): Promise<Alert[]> {
  if (!last || Date.now() - last.at >= POLL) {
    inflight ??= refresh().catch(e => { console.error('alerts', e); if (last) last.at = Date.now(); }).finally(() => { inflight = null; });
    if (!last) await inflight;
  }
  return last?.alerts ?? [];
}
