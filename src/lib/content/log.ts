import type { BroadcastManifest } from '@/lib/types';
import { BROADCAST_TZ, clockTime, daySegments } from './broadcast';

/** The operator's remarks, one per broadcast day, keyed by TX number ('180'). */
export interface LogManifest {
  version: 1;
  remarks: Record<string, string>;
}

export const SEED_LOG: LogManifest = { version: 1, remarks: {} };
export const REMARK_MAX = 120;

// TX: the broadcast day's number, counted from the station's first day on air (day 1).
const FIRST_DAY = Date.UTC(2026, 4, 17);
const DAY_MS = 86_400_000;
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: BROADCAST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export function txNumber(nowMs: number): number {
  const [y, m, d] = dateFmt.format(nowMs).split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - FIRST_DAY) / DAY_MS + 1;
}

export const txDay = (nowMs: number) => String(txNumber(nowMs)).padStart(4, '0');

/** TX n's calendar date, 'YYYY-MM-DD'. */
export const txDate = (n: number) => new Date(FIRST_DAY + (n - 1) * DAY_MS).toISOString().slice(0, 10);

export type LogLine = { tx: string; date: string; hours: string; blocks: string; air: string; open: boolean; remark: string };

/** Every broadcast day from TX 0001 to today, newest first. The hours come from the day clock as it
 *  stands, so every day reads the same shape; only the remarks are kept per day. */
// ponytail: past days are derived from today's schedule, not recorded; snapshot per day if the schedule history should show.
export function logLines(m: BroadcastManifest, log: LogManifest, nowMs: number): LogLine[] {
  const segs = daySegments(m);
  const air = segs.reduce((a, s) => a + s.end - s.start, 0);
  const blocks = new Set(segs.filter((s) => !s.filler).map((s) => s.pid ?? s.idx)).size;   // a block played 3 times is one
  const end = segs.length ? segs[segs.length - 1].end : 0;
  const hours = segs.length ? `${clockTime(segs[0].start)}–${end === 86_400 ? '24:00' : clockTime(end)}` : '--:--–--:--';
  const airText = segs.length ? `${String(Math.floor(air / 3600)).padStart(2, '0')}H ${String(Math.floor(air / 60) % 60).padStart(2, '0')}M` : 'OFF AIR';
  const today = txNumber(nowMs);
  const out: LogLine[] = [];
  for (let n = today; n >= 1; n--) {
    out.push({
      tx: String(n).padStart(4, '0'),
      date: txDate(n),
      hours,
      blocks: `${String(blocks).padStart(2, '0')} BLK`,
      air: airText,
      open: n === today,
      remark: log.remarks[String(n)] ?? '',
    });
  }
  return out;
}
