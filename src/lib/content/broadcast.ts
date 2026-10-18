import type { BroadcastEntry, BroadcastManifest, Mix } from '@/lib/types';

export const PROXY = '/api/audio/stream?file=';

/** '/api/audio/stream?file=inter_1.mp3' → 'inter_1.mp3' */
export function fileFromSrc(src: string): string {
  return src.startsWith(PROXY) ? src.slice(PROXY.length) : src;
}

/** Seconds → 'm:ss' (or 'h:mm:ss'). Matches the display format used today. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** Manifest entry → the runtime `Mix` the player/UI consume. src points at the R2 proxy. */
export function entryToMix(entry: BroadcastEntry): Mix {
  return {
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    date: entry.date,
    duration: formatDuration(entry.durationSec),
    durationSec: entry.durationSec,
    src: `${PROXY}${entry.file}`,
    tags: entry.tags,
    kind: entry.kind,
    hidden: entry.hidden,
  };
}

export function manifestToMixes(m: BroadcastManifest): Mix[] {
  return m.entries.map(entryToMix);
}

/** Filenames the stream proxy may fetch — deduped (interludes repeat). */
export function broadcastFilesFrom(m: BroadcastManifest): string[] {
  return [...new Set(m.entries.map((e) => e.file))];
}

// --- Day clock ----------------------------------------------------------------
// The rotation restarts at midnight in this timezone, so every day plays out identically and each
// entry has a fixed air time. The last loop of the day is cut off at midnight.
export const BROADCAST_TZ = 'America/New_York';
const DAY_SEC = 86_400;

const dayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BROADCAST_TZ,
  hourCycle: 'h23',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** Seconds since midnight in BROADCAST_TZ. */
// ponytail: wall-clock seconds, so DST-change days skip/repeat an hour of the schedule once.
export function secondsIntoDay(nowMs: number): number {
  const p = Object.fromEntries(dayFmt.formatToParts(nowMs).map((x) => [x.type, x.value]));
  return Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second) + (nowMs % 1000) / 1000;
}

/** Which entry is on air at `nowMs` and how far into it. */
export function broadcastPosition(durations: number[], nowMs: number): { trackIdx: number; offsetSec: number } {
  const total = durations.reduce((a, b) => a + b, 0);
  if (total === 0) return { trackIdx: 0, offsetSec: 0 };
  let elapsed = secondsIntoDay(nowMs) % total;
  for (let i = 0; i < durations.length; i++) {
    if (elapsed < durations[i]) return { trackIdx: i, offsetSec: elapsed };
    elapsed -= durations[i];
  }
  return { trackIdx: 0, offsetSec: 0 };
}

export type Slot = { idx: number; start: number; end: number; loop: number; cut: boolean };

/** The full day's run of slots (seconds from midnight) — what the admin timeline draws. */
export function daySchedule(durations: number[]): Slot[] {
  const slots: Slot[] = [];
  if (durations.reduce((a, b) => a + b, 0) <= 0) return slots;
  for (let t = 0, loop = 0; t < DAY_SEC; loop++) {
    for (let i = 0; i < durations.length && t < DAY_SEC; i++) {
      if (durations[i] <= 0) continue;
      const end = t + durations[i];
      slots.push({ idx: i, start: t, end: Math.min(end, DAY_SEC), loop, cut: end > DAY_SEC });
      t = end;
    }
  }
  return slots;
}

/** Seconds from midnight → 'HH:MM'. */
export function clockTime(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
