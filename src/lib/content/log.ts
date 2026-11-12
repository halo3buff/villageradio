import type { BroadcastManifest } from '@/lib/types';
import { BROADCAST_TZ, daySegments, secondsIntoDay } from './broadcast';

// --- The station log: a live feed of what the station does, newest last ---------------------------
// Built on the fly from the day clock (blocks on air, intermissions, silence), the broadcast day's
// turn at midnight and the hourly pips, with the operator's own entries from the console mixed in.
// Shape only: a block is a code, never a title.

/** An operator's entry, posted from the console. */
export interface LogEntry { at: number; text: string }
export interface LogManifest { version: 1; entries: LogEntry[] }

export const SEED_LOG: LogManifest = { version: 1, entries: [] };
export const ENTRY_MAX = 120;
export const ENTRIES_KEPT = 200;

// TX: the broadcast day's number, counted from the station's first day on air (day 1).
const FIRST_DAY = Date.UTC(2026, 4, 17);
const DAY_MS = 86_400_000;
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: BROADCAST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export function txNumber(nowMs: number): number {
  const [y, m, d] = dateFmt.format(nowMs).split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - FIRST_DAY) / DAY_MS + 1;
}

export const txDay = (nowMs: number) => String(txNumber(nowMs)).padStart(4, '0');

/** A block's code: four hex digits from its id, the same every time it airs. */
const code = (id: string) => Array.from(id).reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 7).toString(16).padStart(4, '0').toUpperCase();

/** The day's plan with nothing in it but shape: safe to hand to any visitor. */
export type PlanStep = { start: number; end: number; loop: number; code: string; inter: boolean };

export function logPlan(m: BroadcastManifest): PlanStep[] {
  return daySegments(m).map((s) => {
    const e = m.entries[s.idx];
    return { start: s.start, end: s.end, loop: s.loop, code: code(e.id), inter: e.kind === 'inter' };
  });
}

export type FeedLine = { at: number; tag: string; text: string };

/** The last `count` lines of the log up to `nowMs`, oldest first. */
// ponytail: midnight is found from wall-clock seconds, so on DST-change days the times are an hour out once.
export function feed(plan: PlanStep[], entries: LogEntry[], nowMs: number, count: number): FeedLine[] {
  const today = nowMs - Math.floor(secondsIntoDay(nowMs)) * 1000 - (nowMs % 1000);
  const lines: FeedLine[] = [];
  for (const day of [today - DAY_MS, today]) {
    const n = txNumber(day + 1000);
    if (n > 1) lines.push({ at: day, tag: `TX ${String(n - 1).padStart(4, '0')}`, text: 'CLOSED' });
    lines.push({ at: day, tag: `TX ${String(n).padStart(4, '0')}`, text: 'OPEN' });
    for (let h = 0; h < 24; h++) lines.push({ at: day + h * 3_600_000, tag: 'SIG', text: '1000 HZ' });
    let t = 0;
    for (const s of plan) {
      if (s.start > t) lines.push({ at: day + t * 1000, tag: '----', text: 'OFF AIR' });
      for (let p = s.start; p < s.end; p += s.loop) {
        lines.push({ at: day + p * 1000, tag: `BLK ${s.code}`, text: s.inter ? 'INTERMISSION' : 'ON AIR' });
      }
      t = s.end;
    }
    if (t < 86_400) lines.push({ at: day + t * 1000, tag: '----', text: 'OFF AIR' });
  }
  for (const e of entries) lines.push({ at: e.at, tag: 'OPR', text: e.text });
  return lines.filter((l) => l.at <= nowMs).sort((a, b) => a.at - b.at).slice(-count);
}
