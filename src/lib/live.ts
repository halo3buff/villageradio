import { getAlerts, type Alert } from './alerts';
import { fireLines, getFires, type Fire } from './fires';
import { getGazaReports, getNet, getOutages, getRadarFeed, telexLines, type NetNow, type RadarFeed, type TelexLine } from './radar';
import { readSnapshot, writeSnapshot } from './radarStore';
import { getIncidents, seedIncidents, sourcesOf, type Incident } from './wafa';

/**
 * Everything the radar console shows, gathered in one place for the page's first render
 * and for /api/radar/live, which the console polls. Each source keeps its own pace
 * (alerts 15 s, field reports 1 min, outages 2 min, fires 10 min, reports 5 min); a gather
 * reads the latest of each, and the result is shared through the store (radarStore).
 */

export type Live = {
  at: number;
  feed: RadarFeed | null;
  telex: TelexLine[];
  fires: Fire[] | null;
  incidents: Incident[];
  alerts: Alert[];
  net: NetNow | null;
  took?: Record<string, number>;   // ms each source took on this read
};

const stamp = (t: number) => {
  const iso = new Date(t * 1000).toISOString();
  return `${iso.slice(2, 10).replace(/-/g, '.')} ${iso.slice(11, 16)}Z`;
};

/** One line per event; reported by 2+ channels it ends "2SRC", by one other than WAFA it names it. */
export function incidentLines(xs: Incident[]): TelexLine[] {
  return xs.map(x => {
    const srcs = sourcesOf(x);
    const by = srcs.length > 1 ? `  ${srcs.length}SRC` : x.src !== 'WAFA' ? `  ${x.src}` : '';
    return {
      t: x.t, k: 'incident', hot: x.tags[0] === 'KILLED' || x.tags[0] === 'STRIKE',
      text: `${stamp(x.t)} ${x.tags.slice(0, 2).join(' ')}  ${(x.place?.en.replace(/ Refugee Camp/i, ' Camp') ?? (x.gaza ? 'GAZA STRIP' : '(UNPLACED)')).toUpperCase().slice(0, 18)}${by}`,
    };
  });
}

export function alertLines(xs: Alert[]): TelexLine[] {
  return xs.map(a => ({
    t: a.t, k: 'alert', hot: true,
    text: `${stamp(a.t)} SIRENS ${a.threat}  ${(a.cities[0]?.en ?? '?').toUpperCase().slice(0, 18)}${a.cities.length > 1 ? ` +${a.cities.length - 1}` : ''}`,
  }));
}

const STALE = 20_000;   // a snapshot older than this is gathered afresh (sirens move every 15 s)
const MEM = 5_000;      // how long this instance trusts what it last read before asking the store again
let mem: Live | null = null, memAt = 0, seeded = false;
let gathering: Promise<Live> | null = null;
const newer = (a: Live | null, b: Live | null) => (!a ? b : !b ? a : a.at >= b.at ? a : b);

/**
 * The latest snapshot, shared by every server instance through the store: answered at once from
 * it, and gathered afresh in the background whenever it's gone stale (only the very first ever
 * waits). A fresh instance seeds its report history from the snapshot before its first gather.
 */
export async function getLive(): Promise<Live> {
  if (mem && Date.now() - memAt < MEM && Date.now() - mem.at < STALE) return mem;
  const snap = newer(await readSnapshot<Live>().catch(e => { console.error('radar store read', e); return null; }), mem);
  mem = snap; memAt = Date.now();
  if (!snap || Date.now() - snap.at >= STALE) {
    // ponytail: instances that find it stale at the same moment each gather; one write wins. A lock if traffic grows.
    gathering ??= gather(snap)
      .then(async l => { mem = newer(l, mem); memAt = Date.now(); await writeSnapshot(l).catch(e => console.error('radar store write', e)); return l; })
      .finally(() => { gathering = null; });
    if (!snap) return gathering;
  }
  return snap;
}

async function gather(prev: Live | null): Promise<Live> {
  if (prev && !seeded) seedIncidents(prev.incidents);
  seeded = true;
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Date.now(), took: Record<string, number> = {};
  const timed = <T,>(name: string, p: Promise<T>) => p.finally(() => { took[name] = Date.now() - t0; });
  const [feed, gaza, outages, net, fires, incidents, alerts] = await Promise.all([
    timed('feed', getRadarFeed()), timed('gaza', getGazaReports(today)), timed('outages', getOutages()), timed('net', getNet()),
    timed('fires', getFires()), timed('wafa', getIncidents()), timed('alerts', getAlerts()),
  ]);
  if (Date.now() - t0 > 5000) console.warn('radar live slow', JSON.stringify(took));
  // a source that's still loading or failing keeps what the last snapshot had
  const f = feed ?? prev?.feed ?? null, fs = fires ?? prev?.fires ?? null;
  const telex = telexLines(f?.contacts ?? [], gaza, outages, [
    ...net.lines, ...fireLines(fs ?? []), ...incidentLines(incidents), ...alertLines(alerts),
  ]);
  return { at: Date.now(), feed: f, telex, fires: fs, incidents, alerts, net: net.now ?? prev?.net ?? null, took };
}
