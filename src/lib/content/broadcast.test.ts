import { describe, it, expect } from 'vitest';
import type { BroadcastManifest } from '@/lib/types';
import { entryToMix, formatDuration, manifestToMixes, broadcastFilesFrom } from './broadcast';

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
