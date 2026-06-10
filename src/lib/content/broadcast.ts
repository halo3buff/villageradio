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
  };
}

export function manifestToMixes(m: BroadcastManifest): Mix[] {
  return m.entries.map(entryToMix);
}

/** Filenames the stream proxy may fetch — deduped (interludes repeat). */
export function broadcastFilesFrom(m: BroadcastManifest): string[] {
  return [...new Set(m.entries.map((e) => e.file))];
}
