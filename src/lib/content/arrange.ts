import type { BroadcastEntry, BroadcastManifest } from '@/lib/types';

// Pure, importable arrangement helpers. The client editor is a thin shell over these so the
// reorder/validation logic is unit-testable in Vitest's node environment (no jsdom).

const FILENAME_RE = /^[A-Za-z0-9._-]+\.(mp3|wav|ogg|m4a)$/;
const DATE_RE = /^(\d{2}-\d{2}-\d{4})?$/; // 'MM-DD-YYYY' or '' (interludes)
const SERIES = new Set(['red', 'green', 'yellow']);
const KINDS = new Set(['mix', 'inter']);

/** Swap the entry at `index` with the one above it. No-op at the top. Returns a new array. */
export function moveUp(entries: BroadcastEntry[], index: number): BroadcastEntry[] {
  if (index <= 0 || index >= entries.length) return entries.slice();
  return moveTo(entries, index, index - 1);
}

/** Swap the entry at `index` with the one below it. No-op at the bottom. Returns a new array. */
export function moveDown(entries: BroadcastEntry[], index: number): BroadcastEntry[] {
  if (index < 0 || index >= entries.length - 1) return entries.slice();
  return moveTo(entries, index, index + 1);
}

/** Relocate the entry at `from` to `to`. Returns a new array. */
export function moveTo(entries: BroadcastEntry[], from: number, to: number): BroadcastEntry[] {
  const next = entries.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return entries.slice();
  next.splice(to, 0, moved);
  return next;
}

/** Append an entry. Returns a new array. */
export function addEntry(entries: BroadcastEntry[], entry: BroadcastEntry): BroadcastEntry[] {
  return [...entries, entry];
}

/** Remove the entry with the given id. Returns a new array. */
export function removeEntry(entries: BroadcastEntry[], id: string): BroadcastEntry[] {
  return entries.filter((e) => e.id !== id);
}

/**
 * Derive a unique entry id from a filename. Interludes reuse the same file with distinct
 * ids, so collisions get a `b`, `c`, … suffix (matching the seed's `inter-1` → `inter-1b`).
 */
export function generateEntryId(file: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  const base = file.replace(/\.[^.]+$/, '').replace(/_/g, '-');
  if (!taken.has(base)) return base;
  for (let c = 'b'.charCodeAt(0); c <= 'z'.charCodeAt(0); c++) {
    const candidate = base + String.fromCharCode(c);
    if (!taken.has(candidate)) return candidate;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * Structurally validate untrusted manifest JSON before it is written. Guards the manifest
 * shape, unique ids, safe filenames (the stream proxy fetches `${R2_BASE}/${file}` raw), and
 * the mix-only `series` / `MM-DD-YYYY` date invariants.
 */
export function validateManifest(data: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const m = data as Partial<BroadcastManifest> | null;

  if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest must be an object'] };
  if (m.version !== 1) errors.push('version must be 1');
  if (!Array.isArray(m.entries)) {
    errors.push('entries must be an array');
    return { ok: false, errors };
  }

  const seen = new Set<string>();
  m.entries.forEach((raw, i) => {
    const e = raw as Partial<BroadcastEntry>;
    const at = `entry ${i}`;
    if (!e || typeof e !== 'object') {
      errors.push(`${at}: must be an object`);
      return;
    }
    if (typeof e.id !== 'string' || e.id.length === 0) errors.push(`${at}: id must be a non-empty string`);
    else if (seen.has(e.id)) errors.push(`${at}: duplicate id "${e.id}"`);
    else seen.add(e.id);

    if (typeof e.title !== 'string') errors.push(`${at}: title must be a string`);
    if (typeof e.artist !== 'string') errors.push(`${at}: artist must be a string`);
    if (typeof e.date !== 'string' || !DATE_RE.test(e.date)) errors.push(`${at}: date must be 'MM-DD-YYYY' or ''`);
    if (typeof e.durationSec !== 'number' || !Number.isFinite(e.durationSec) || e.durationSec < 0)
      errors.push(`${at}: durationSec must be a non-negative number`);
    if (typeof e.file !== 'string' || !FILENAME_RE.test(e.file) || e.file.includes('..'))
      errors.push(`${at}: file must be a safe audio filename`);
    if (typeof e.kind !== 'string' || !KINDS.has(e.kind)) errors.push(`${at}: kind must be 'mix' or 'inter'`);
    if (e.series !== undefined) {
      if (!SERIES.has(e.series)) errors.push(`${at}: series must be red|green|yellow`);
      if (e.kind === 'inter') errors.push(`${at}: interludes must not have a series`);
    }
    if (!isStringArray(e.tags)) errors.push(`${at}: tags must be an array of strings`);
  });

  return { ok: errors.length === 0, errors };
}
