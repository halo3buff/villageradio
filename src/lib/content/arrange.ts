import type { BroadcastEntry, BroadcastManifest, Placement } from '@/lib/types';
import { uniqueSuffix } from './ids';

// Pure, importable arrangement helpers. The client editor is a thin shell over these so the
// reorder/validation logic is unit-testable in Vitest's node environment (no jsdom).

// Index reordering is generic — broadcast/photos/work all share it (see reorder.ts).
export { moveUp, moveDown, moveTo } from './reorder';

const FILENAME_RE = /^[A-Za-z0-9._-]+\.(mp3|wav|ogg|m4a)$/;
const DATE_RE = /^(\d{2}-\d{2}-\d{4})?$/; // 'MM-DD-YYYY' or '' (interludes)
const SERIES = new Set(['red', 'green', 'yellow']);
const KINDS = new Set(['mix', 'inter']);

/** Append an entry. Returns a new array. */
export function addEntry(entries: BroadcastEntry[], entry: BroadcastEntry): BroadcastEntry[] {
  return [...entries, entry];
}

/** Remove the entry with the given id. Returns a new array. */
export function removeEntry(entries: BroadcastEntry[], id: string): BroadcastEntry[] {
  return entries.filter((e) => e.id !== id);
}

/**
 * Put entry `id` on air directly before/after entry `targetId` (unhiding it). With no target,
 * it goes to the end. Returns a new array.
 */
export function placeEntry(
  entries: BroadcastEntry[],
  id: string,
  targetId: string | null,
  after: boolean,
): BroadcastEntry[] {
  const moving = entries.find((e) => e.id === id);
  if (!moving || id === targetId) return entries.slice();
  const rest = entries.filter((e) => e.id !== id);
  const t = targetId === null ? -1 : rest.findIndex((e) => e.id === targetId);
  const at = t < 0 ? rest.length : t + (after ? 1 : 0);
  rest.splice(at, 0, { ...moving, hidden: false });
  return rest;
}

const DAY = 86_400;

/**
 * Put `block` on the day at `block.start` (new or moved — matched by id). Dropped inside another
 * block, it lands on that block's nearer edge. Blocks it would overlap ripple later; any pushed
 * to or past midnight fall off (counted in `dropped`). Touching blocks of the same entry merge
 * into one longer block; `id` is the block that now holds the placed one.
 */
export function placeAt(
  schedule: Placement[],
  lenOf: (entryId: string) => number,
  block: Placement,
): { schedule: Placement[]; id: string; dropped: number } {
  const end = (b: Placement) => b.start + lenOf(b.entry) * b.plays;
  const rest = schedule.filter((b) => b.id !== block.id).map((b) => ({ ...b })).sort((a, b) => a.start - b.start);
  let start = Math.min(Math.max(Math.round(block.start), 0), DAY - 1);
  const inside = rest.find((b) => start > b.start && start < end(b));
  if (inside) start = start - inside.start < end(inside) - start ? inside.start : end(inside);
  const placed = { ...block, start };
  // ripple: everything from here on that the new block (or a pushed one) now overlaps
  let cursor = end(placed);
  for (const b of rest) {
    if (b.start < start) continue;
    if (b.start >= cursor) break;
    b.start = cursor;
    cursor = end(b);
  }
  const all = [...rest, placed].sort((a, b) => a.start - b.start);
  const kept = all.filter((b) => b.start < DAY);
  // merge touching same-entry neighbours
  const out: Placement[] = [];
  let id = placed.id;
  for (const b of kept) {
    const prev = out[out.length - 1];
    if (prev && prev.entry === b.entry && end(prev) === b.start) {
      prev.plays += b.plays;
      if (b.id === id) id = prev.id;
    } else out.push(b);
  }
  return { schedule: out, id, dropped: all.length - kept.length };
}

/**
 * Derive a unique entry id from a filename. Interludes reuse the same file with distinct
 * ids, so collisions get a `b`, `c`, … suffix (matching the seed's `inter-1` → `inter-1b`).
 */
export function generateEntryId(file: string, existingIds: Iterable<string>): string {
  const base = file.replace(/\.[^.]+$/, '').replace(/_/g, '-');
  return uniqueSuffix(base, existingIds);
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
    if (e.hidden !== undefined && typeof e.hidden !== 'boolean') errors.push(`${at}: hidden must be a boolean`);
  });

  if (m.schedule !== undefined) {
    if (!Array.isArray(m.schedule)) errors.push('schedule must be an array');
    else {
      const ids = new Set<string>();
      m.schedule.forEach((raw, i) => {
        const p = raw as Partial<Placement>;
        const at = `block ${i}`;
        if (!p || typeof p !== 'object') return void errors.push(`${at}: must be an object`);
        if (typeof p.id !== 'string' || !p.id || ids.has(p.id)) errors.push(`${at}: id must be unique`);
        else ids.add(p.id);
        if (typeof p.entry !== 'string' || !seen.has(p.entry)) errors.push(`${at}: plays an entry that isn't in the library`);
        if (typeof p.start !== 'number' || !(p.start >= 0 && p.start < DAY)) errors.push(`${at}: start must be within the day`);
        if (!Number.isInteger(p.plays) || (p.plays as number) < 1) errors.push(`${at}: plays must be a whole number ≥ 1`);
      });
    }
  }
  if (m.filler !== undefined && (typeof m.filler !== 'string' || !seen.has(m.filler)))
    errors.push('the empty-time mix is not in the library');

  return { ok: errors.length === 0, errors };
}
