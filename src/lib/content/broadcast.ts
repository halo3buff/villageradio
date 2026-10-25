import type { BroadcastEntry, BroadcastManifest, Mix, Placement } from '@/lib/types';

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
    lufs: entry.lufs,
    gainDb: entry.gainDb,
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

// --- Placed schedule ----------------------------------------------------------------
// What actually airs: a list of segments over the day. A segment plays entry `idx` (an index
// into manifest.entries) from `start` to `end`, restarting every `loop` seconds — so a block
// played 3× is one segment, and filler looping through a gap is one segment. No segment =
// silence.
export type Segment = { start: number; end: number; idx: number; loop: number; pid?: string; filler?: boolean };

export function daySegments(m: BroadcastManifest): Segment[] {
  if (!m.schedule) {
    // legacy: the on-air entries loop from midnight
    const on = m.entries.map((e, i) => ({ e, i })).filter(({ e }) => !e.hidden);
    return daySchedule(on.map(({ e }) => e.durationSec)).map((s) => ({
      start: s.start, end: s.end, idx: on[s.idx].i, loop: on[s.idx].e.durationSec,
    }));
  }
  const at = new Map(m.entries.map((e, i) => [e.id, i]));
  const len = (id: string | undefined) => (id === undefined || !at.has(id) ? 0 : m.entries[at.get(id)!].durationSec);
  const fillLen = len(m.filler);
  const segs: Segment[] = [];
  let t = 0;
  const fill = (to: number) => {
    if (fillLen > 0 && to > t) segs.push({ start: t, end: to, idx: at.get(m.filler!)!, loop: fillLen, filler: true });
  };
  for (const p of [...m.schedule].sort((a, b) => a.start - b.start)) {
    const l = len(p.entry);
    const start = Math.max(p.start, t); // overlaps are tolerated: a block waits for the one before
    if (l <= 0 || p.plays < 1 || start >= DAY_SEC) continue;
    fill(start);
    t = Math.min(start + l * p.plays, DAY_SEC);
    segs.push({ start, end: t, idx: at.get(p.entry)!, loop: l, pid: p.id });
  }
  fill(DAY_SEC);
  return segs;
}

/** What airs at `sec` into the day: entry index (-1 = silence), how far into it, and when this
 *  play (or this silence) ends. */
export function positionAt(segs: Segment[], sec: number): { idx: number; offset: number; until: number } {
  for (const s of segs) {
    if (sec < s.start) return { idx: -1, offset: 0, until: s.start };
    if (sec < s.end) {
      const k = Math.floor((sec - s.start) / s.loop);
      return { idx: s.idx, offset: sec - s.start - k * s.loop, until: Math.min(s.end, s.start + (k + 1) * s.loop) };
    }
  }
  return { idx: -1, offset: 0, until: DAY_SEC };
}

/** A legacy looping lineup as placed blocks (back-to-back repeats of one entry merge). */
export function toPlacements(m: BroadcastManifest): Placement[] {
  const out: Placement[] = [];
  for (const s of daySegments({ ...m, schedule: undefined })) {
    const prev = out[out.length - 1];
    const id = m.entries[s.idx].id;
    if (prev && prev.entry === id && prev.start + prev.plays * s.loop === s.start) prev.plays++;
    else out.push({ id: `p${out.length + 1}`, entry: id, start: s.start, plays: 1 });
  }
  return out;
}
