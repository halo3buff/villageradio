import { describe, it, expect } from 'vitest';
import type { BroadcastEntry } from '@/lib/types';
import {
  moveUp,
  moveDown,
  moveTo,
  addEntry,
  removeEntry,
  generateEntryId,
  validateManifest,
} from './arrange';

function mix(id: string, file = `${id}.mp3`): BroadcastEntry {
  return { id, title: id.toUpperCase(), artist: 'Village Radio', date: '06-28-2025', durationSec: 100, file, kind: 'mix', series: 'red', tags: [] };
}
function inter(id: string, file = 'inter_1.mp3'): BroadcastEntry {
  return { id, title: 'BREAK', artist: 'Village Radio', date: '', durationSec: 20, file, kind: 'inter', tags: [] };
}

const ids = (entries: BroadcastEntry[]) => entries.map((e) => e.id);

describe('moveUp', () => {
  it('swaps an entry with the one above it', () => {
    const list = [mix('a'), mix('b'), mix('c')];
    expect(ids(moveUp(list, 1))).toEqual(['b', 'a', 'c']);
  });
  it('is a no-op at the top', () => {
    const list = [mix('a'), mix('b')];
    expect(ids(moveUp(list, 0))).toEqual(['a', 'b']);
  });
  it('does not mutate the input', () => {
    const list = [mix('a'), mix('b')];
    moveUp(list, 1);
    expect(ids(list)).toEqual(['a', 'b']);
  });
});

describe('moveDown', () => {
  it('swaps an entry with the one below it', () => {
    const list = [mix('a'), mix('b'), mix('c')];
    expect(ids(moveDown(list, 1))).toEqual(['a', 'c', 'b']);
  });
  it('is a no-op at the bottom', () => {
    const list = [mix('a'), mix('b')];
    expect(ids(moveDown(list, 1))).toEqual(['a', 'b']);
  });
});

describe('moveTo', () => {
  it('relocates an entry from one index to another', () => {
    const list = [mix('a'), mix('b'), mix('c'), mix('d')];
    expect(ids(moveTo(list, 0, 2))).toEqual(['b', 'c', 'a', 'd']);
  });
  it('moves backwards too', () => {
    const list = [mix('a'), mix('b'), mix('c')];
    expect(ids(moveTo(list, 2, 0))).toEqual(['c', 'a', 'b']);
  });
  it('is a no-op when from === to', () => {
    const list = [mix('a'), mix('b')];
    expect(ids(moveTo(list, 1, 1))).toEqual(['a', 'b']);
  });
});

describe('addEntry', () => {
  it('appends to the end', () => {
    const list = [mix('a')];
    expect(ids(addEntry(list, mix('b')))).toEqual(['a', 'b']);
  });
});

describe('removeEntry', () => {
  it('removes by id, preserving order', () => {
    const list = [mix('a'), mix('b'), mix('c')];
    expect(ids(removeEntry(list, 'b'))).toEqual(['a', 'c']);
  });
  it('removes only the first match when ids collide is impossible (ids are unique)', () => {
    const list = [inter('inter-1'), inter('inter-1b')];
    expect(ids(removeEntry(list, 'inter-1'))).toEqual(['inter-1b']);
  });
});

describe('generateEntryId', () => {
  it('derives a slug from the filename (underscores to dashes, no extension)', () => {
    expect(generateEntryId('red_06-28-2025.mp3', [])).toBe('red-06-28-2025');
  });
  it('suffixes a reused file with b, then c (matches the seed inter-1b convention)', () => {
    expect(generateEntryId('inter_1.mp3', ['inter-1'])).toBe('inter-1b');
    expect(generateEntryId('inter_1.mp3', ['inter-1', 'inter-1b'])).toBe('inter-1c');
  });
});

describe('validateManifest', () => {
  const ok = { version: 1, entries: [mix('a'), inter('inter-1')] };

  it('accepts a well-formed manifest', () => {
    expect(validateManifest(ok)).toEqual({ ok: true, errors: [] });
  });
  it('rejects a non-1 version', () => {
    const r = validateManifest({ version: 2, entries: [] });
    expect(r.ok).toBe(false);
  });
  it('rejects when entries is not an array', () => {
    expect(validateManifest({ version: 1, entries: {} }).ok).toBe(false);
  });
  it('rejects duplicate ids', () => {
    const r = validateManifest({ version: 1, entries: [mix('a'), mix('a')] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate/i);
  });
  it('rejects a path-traversal or unsafe filename', () => {
    const bad = { ...mix('a'), file: '../secret.mp3' };
    expect(validateManifest({ version: 1, entries: [bad] }).ok).toBe(false);
  });
  it('rejects a filename without an allowed extension', () => {
    const bad = { ...mix('a'), file: 'song.exe' };
    expect(validateManifest({ version: 1, entries: [bad] }).ok).toBe(false);
  });
  it('rejects a series on an interlude', () => {
    const bad = { ...inter('inter-1'), series: 'red' };
    expect(validateManifest({ version: 1, entries: [bad] }).ok).toBe(false);
  });
  it('rejects an unknown series value', () => {
    const bad = { ...mix('a'), series: 'blue' };
    expect(validateManifest({ version: 1, entries: [bad] }).ok).toBe(false);
  });
  it('rejects a bad date format on a mix', () => {
    const bad = { ...mix('a'), date: '2026-06-28' };
    expect(validateManifest({ version: 1, entries: [bad] }).ok).toBe(false);
  });
  it('rejects a non-numeric durationSec', () => {
    const bad = { ...mix('a'), durationSec: 'long' };
    expect(validateManifest({ version: 1, entries: [bad] }).ok).toBe(false);
  });
  it('rejects non-string tags', () => {
    const bad = { ...mix('a'), tags: [1, 2] };
    expect(validateManifest({ version: 1, entries: [bad] }).ok).toBe(false);
  });
});
