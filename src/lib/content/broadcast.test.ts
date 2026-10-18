import { describe, it, expect } from 'vitest';
import type { BroadcastManifest } from '@/lib/types';
import {
  entryToMix,
  formatDuration,
  manifestToMixes,
  broadcastFilesFrom,
  secondsIntoDay,
  broadcastPosition,
  daySchedule,
  clockTime,
} from './broadcast';

const manifest: BroadcastManifest = {
  version: 1,
  entries: [
    { id: 'inter-1', title: 'BREAK', artist: 'Village Radio', date: '', durationSec: 22, file: 'inter_1.mp3', kind: 'inter', tags: [] },
    { id: 'red-1', title: 'RED', artist: 'Village Radio', date: '06-28-2025', durationSec: 498, file: 'red_06-28-2025.mp3', kind: 'mix', series: 'red', tags: [] },
    { id: 'inter-1b', title: 'BREAK', artist: 'Village Radio', date: '', durationSec: 22, file: 'inter_1.mp3', kind: 'inter', tags: [] },
  ],
};

describe('formatDuration', () => {
  it('formats m:ss', () => {
    expect(formatDuration(498)).toBe('8:18');
    expect(formatDuration(22)).toBe('0:22');
  });
  it('formats h:mm:ss past an hour', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});

describe('entryToMix', () => {
  it('derives the R2 proxy src and the duration string', () => {
    const mix = entryToMix(manifest.entries[1]);
    expect(mix.src).toBe('/api/audio/stream?file=red_06-28-2025.mp3');
    expect(mix.duration).toBe('8:18');
    expect(mix.durationSec).toBe(498);
    expect(mix.kind).toBe('mix');
  });

  it('carries hidden through to the runtime Mix', () => {
    const hidden = { ...manifest.entries[1], hidden: true };
    expect(entryToMix(hidden).hidden).toBe(true);
    expect(entryToMix(manifest.entries[1]).hidden).toBeUndefined();
  });
});

describe('manifestToMixes', () => {
  it('preserves order and length', () => {
    const mixes = manifestToMixes(manifest);
    expect(mixes).toHaveLength(3);
    expect(mixes[0].id).toBe('inter-1');
  });
});

describe('broadcastFilesFrom', () => {
  it('dedupes repeated interludes', () => {
    expect(broadcastFilesFrom(manifest)).toEqual(['inter_1.mp3', 'red_06-28-2025.mp3']);
  });
});

describe('day clock', () => {
  it('restarts the rotation at midnight', () => {
    const midnight = Date.parse('2026-03-01T00:00:00-05:00'); // EST midnight
    expect(secondsIntoDay(midnight)).toBe(0);
    expect(broadcastPosition([100, 200], midnight)).toEqual({ trackIdx: 0, offsetSec: 0 });
    expect(broadcastPosition([100, 200], midnight + 150_000)).toEqual({ trackIdx: 1, offsetSec: 50 });
    expect(broadcastPosition([100, 200], midnight + 350_000)).toEqual({ trackIdx: 0, offsetSec: 50 });
  });

  it('fills the day with loops and cuts the last one at midnight', () => {
    const slots = daySchedule([3600, 1800]); // 1.5h loop → 16 loops exactly
    expect(slots).toHaveLength(32);
    expect(slots.some((s) => s.cut)).toBe(false);
    const odd = daySchedule([50_000]);
    expect(odd).toEqual([
      { idx: 0, start: 0, end: 50_000, loop: 0, cut: false },
      { idx: 0, start: 50_000, end: 86_400, loop: 1, cut: true },
    ]);
    expect(daySchedule([0, 0])).toEqual([]);
    expect(clockTime(75_660)).toBe('21:01');
  });
});
