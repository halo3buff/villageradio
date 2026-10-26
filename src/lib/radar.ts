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
    const get = (p: string) => fetch(`${API}/${p}`, { next: { revalidate: 3600 } }).then(r => {
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
