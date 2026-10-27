import { getAlerts, type Alert } from './alerts';
import { fireLines, getFires, type Fire } from './fires';
import { getGazaReports, getNet, getOutages, getRadarFeed, telexLines, type NetNow, type RadarFeed, type TelexLine } from './radar';
import { getIncidents, type Incident } from './wafa';

/**
 * Everything the radar console shows, gathered in one place for the page's first render
 * and for /api/radar/live, which the console polls. Each source keeps its own pace
 * (alerts 15 s, WAFA 1 min, outages 2 min, fires 10 min, reports 5 min); this just reads
 * the latest of each.
 */

export type Live = {
  at: number;
  feed: RadarFeed | null;
  telex: TelexLine[];
  fires: Fire[] | null;
  incidents: Incident[];
  alerts: Alert[];
  net: NetNow | null;
};

const stamp = (t: number) => {
  const iso = new Date(t * 1000).toISOString();
  return `${iso.slice(2, 10).replace(/-/g, '.')} ${iso.slice(11, 16)}Z`;
};

export function incidentLines(xs: Incident[]): TelexLine[] {
  return xs.map(x => ({
    t: x.t, k: 'incident', hot: x.tags[0] === 'KILLED' || x.tags[0] === 'STRIKE',
    text: `${stamp(x.t)} ${x.tags.slice(0, 2).join(' ')}  ${(x.place?.en.replace(/ Refugee Camp/i, ' Camp') ?? (x.gaza ? 'GAZA STRIP' : '(UNPLACED)')).toUpperCase().slice(0, 18)}`,
  }));
}

export function alertLines(xs: Alert[]): TelexLine[] {
  return xs.map(a => ({
    t: a.t, k: 'alert', hot: true,
    text: `${stamp(a.t)} SIRENS ${a.threat}  ${(a.cities[0]?.en ?? '?').toUpperCase().slice(0, 18)}${a.cities.length > 1 ? ` +${a.cities.length - 1}` : ''}`,
  }));
}

export async function getLive(): Promise<Live> {
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Date.now(), took: Record<string, number> = {};
  const timed = <T,>(name: string, p: Promise<T>) => p.finally(() => { took[name] = Date.now() - t0; });
  const [feed, gaza, outages, net, fires, incidents, alerts] = await Promise.all([
    timed('feed', getRadarFeed()), timed('gaza', getGazaReports(today)), timed('outages', getOutages()), timed('net', getNet()),
    timed('fires', getFires()), timed('wafa', getIncidents()), timed('alerts', getAlerts()),
  ]);
  if (Date.now() - t0 > 5000) console.warn('radar live slow', JSON.stringify(took));
  const telex = telexLines(feed?.contacts ?? [], gaza, outages, [
    ...net.lines, ...fireLines(fires ?? []), ...incidentLines(incidents), ...alertLines(alerts),
  ]);
  return { at: Date.now(), feed, telex, fires, incidents, alerts, net: net.now };
}
