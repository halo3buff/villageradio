/**
 * The radar's feed: Tech for Palestine's public datasets (no key), which compile
 * UN OCHA flash updates (West Bank) and the Gaza / Lebanon health ministries.
 * https://data.techforpalestine.org/docs/datasets/
 */

const API = 'https://data.techforpalestine.org/api';

/** One West Bank report's new incidents since the report before it. */
export type Contact = { date: string; killed: number; injured: number; attacks: number; displaced: number };

export type RadarFeed = {
  contacts: Contact[];   // the past year's reports, oldest first
  summary: {
    gaza: { killed: number; children: number; women: number; press: number; medical: number; injured: number; updated: string };
    westBank: { killed: number; children: number; injured: number; attacks: number; displaced: number; updated: string };
    lebanon: { killed: number; injured: number; since: string; updated: string };
  };
};

type WBRow = { report_date: string; flash_source?: string } & Partial<Record<
  'killed_cum' | 'injured_cum' | 'settler_attacks_cum' | 'displaced_persons_cum', number>>;

const delta = (a: number | undefined, b: number | undefined) => Math.max(0, (b ?? 0) - (a ?? b ?? 0));

/** Daily cumulative rows → one contact per real report in the last `days`. The feed
 *  carries forward-filled days between reports ("fill"); those add nothing. */
export function contacts(rows: WBRow[], today: string, days = 365): Contact[] {
  const from = new Date(Date.parse(today) - days * 864e5).toISOString().slice(0, 10);
  const out: Contact[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (b.report_date <= from || b.flash_source === 'fill') continue;
    const c = {
      date: b.report_date,
      killed: delta(a.killed_cum, b.killed_cum),
      injured: delta(a.injured_cum, b.injured_cum),
      attacks: delta(a.settler_attacks_cum, b.settler_attacks_cum),
      displaced: delta(a.displaced_persons_cum, b.displaced_persons_cum),
    };
    if (c.killed + c.injured + c.attacks + c.displaced) out.push(c);
  }
  return out;
}

/** Null when the feed is down — the page shows NO SIGNAL rather than failing. */
export async function getRadarFeed(): Promise<RadarFeed | null> {
  try {
    const get = (p: string) => fetch(`${API}/${p}`, { next: { revalidate: 300 } }).then(r => {
      if (!r.ok) throw new Error(`${p} ${r.status}`);
      return r.json();
    });
    const [s, wb] = await Promise.all([get('v3/summary.json'), get('v2/west_bank_daily.json') as Promise<WBRow[]>]);
    const last = wb.at(-1);
    return {
      contacts: contacts(wb, s.west_bank.last_update),
      summary: {
        gaza: { ...s.gaza.killed, injured: s.gaza.injured.total, killed: s.gaza.killed.total, updated: s.gaza.last_update },
        westBank: {
          killed: s.west_bank.killed.total, children: s.west_bank.killed.children,
          injured: s.west_bank.injured.total, attacks: s.west_bank.settler_attacks,
          displaced: last?.displaced_persons_cum ?? 0, updated: s.west_bank.last_update,
        },
        lebanon: { killed: s.lebanon.killed.total, injured: s.lebanon.injured.total, since: s.lebanon.first_report, updated: s.lebanon.last_update },
      },
    };
  } catch (e) {
    console.error('radar feed', e);
    return null;
  }
}

// ── Gaza's daily ministry reports, for the teleprinter ───────────────────────

export type GazaReport = { date: string; killed: number; injured: number; recovered: number };
type GazaRow = { report_date: string; report_source?: string; killed?: number; injured?: number; killed_recovered?: number };

/** The last `days` of real reports (the feed marks gaps it filled in as 'missing'). */
export function gazaReports(rows: GazaRow[], today: string, days = 45): GazaReport[] {
  const from = new Date(Date.parse(today) - days * 864e5).toISOString().slice(0, 10);
  return rows
    .filter(r => r.report_date > from && r.report_source !== 'missing' && r.killed != null)
    .map(r => ({ date: r.report_date, killed: r.killed ?? 0, injured: r.injured ?? 0, recovered: r.killed_recovered ?? 0 }));
}

export async function getGazaReports(today: string): Promise<GazaReport[]> {
  try {
    const r = await fetch(`${API}/v2/casualties_daily.json`, { next: { revalidate: 300 } });
    if (!r.ok) throw new Error(`casualties_daily ${r.status}`);
    return gazaReports(await r.json(), today);
  } catch (e) {
    console.error('gaza reports', e);
    return [];
  }
}

// ── internet outages (IODA, Georgia Tech), for the teleprinter ──────────────

const IODA = 'https://api.ioda.inetintel.cc.gatech.edu/v2';
const REGIONS = [{ code: 1226, name: 'GAZA' }, { code: 4581, name: 'WEST BANK' }];

export type Outage = { region: string; start: number; end: number; source: string };

/** The past 30 days of outages IODA detected in each region; empty when it's unreachable. */
export async function getOutages(): Promise<Outage[]> {
  const until = Math.floor(Date.now() / 1000 / 3600) * 3600;
  try {
    const all = await Promise.all(REGIONS.map(async ({ code, name }) => {
      const r = await fetch(`${IODA}/outages/events?entityType=region&entityCode=${code}&from=${until - 30 * 86400}&until=${until}`, { next: { revalidate: 120 } });
      if (!r.ok) throw new Error(`ioda ${r.status}`);
      return ((await r.json()).data as { start: number; duration: number; datasource: string }[])
        .map(e => ({ region: name, start: e.start, end: e.start + e.duration, source: e.datasource }));
    }));
    return all.flat();
  } catch (e) {
    console.error('outages', e);
    return [];
  }
}

// ── the teleprinter's roll ───────────────────────────────────────────────────

export type TelexLine = { t: number; text: string };   // t = unix seconds

const stamp = (d: string) => d.slice(2).replace(/-/g, '.');
const field = (k: string, v: number) => (v ? `  ${k} ${v.toLocaleString('en-US')}` : '');

/** Every report and outage as one printed line, oldest first. */
export function telexLines(wb: Contact[], gaza: GazaReport[], outages: Outage[]): TelexLine[] {
  const day = (d: string) => Date.parse(d) / 1000 + 12 * 3600;   // reports print at noon
  const lines: TelexLine[] = [
    ...wb.map(c => ({ t: day(c.date), text: `${stamp(c.date)} WB  ${field('KIA', c.killed)}${field('INJ', c.injured)}${field('SETTLER ATK', c.attacks)}${field('DISPL', c.displaced)}` })),
    ...gaza.map(g => ({ t: day(g.date), text: `${stamp(g.date)} GAZA${field('KIA', g.killed)}${field('INJ', g.injured)}${g.recovered ? `  (${g.recovered} RECOVERED)` : ''}` })),
    ...outages.map(o => {
      const iso = new Date(o.start * 1000).toISOString();
      return { t: o.start, text: `${stamp(iso.slice(0, 10))} ${iso.slice(11, 16)}Z ${o.region} NET OUTAGE ${o.source.toUpperCase()} ${Math.round((o.end - o.start) / 60)} MIN` };
    }),
  ];
  return lines.sort((a, b) => a.t - b.t);
}
