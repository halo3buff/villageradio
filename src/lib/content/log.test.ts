import { describe, it, expect } from 'vitest';
import { logLines, txDay } from './log';
import type { BroadcastManifest } from '@/lib/types';

const e = (id: string, durationSec: number) => ({ id, title: id, artist: '', date: '', durationSec, file: id, kind: 'mix' as const, tags: [] });

describe('log', () => {
  it('counts TX from 17 May 2026 (Eastern)', () => {
    expect(txDay(Date.UTC(2026, 4, 17, 12))).toBe('0001');
    expect(txDay(Date.UTC(2026, 4, 18, 3))).toBe('0001');   // still the 17th in New York
  });

  it('writes one line per day, newest first, with the day clock\'s shape and the remarks', () => {
    const m: BroadcastManifest = {
      version: 1, entries: [e('a', 3600), e('b', 1800)],
      schedule: [{ id: 'p1', entry: 'a', start: 6 * 3600, plays: 2 }, { id: 'p2', entry: 'b', start: 20 * 3600, plays: 1 }],
    };
    const lines = logLines(m, { version: 1, remarks: { '2': 'Rain on the mast.' } }, Date.UTC(2026, 4, 19, 16));
    expect(lines.map((l) => l.tx)).toEqual(['0003', '0002', '0001']);
    expect(lines[0]).toMatchObject({ date: '2026-05-19', hours: '06:00–20:30', blocks: '02 BLK', air: '02H 30M', open: true, remark: '' });
    expect(lines[1]).toMatchObject({ open: false, remark: 'Rain on the mast.' });
  });
});
