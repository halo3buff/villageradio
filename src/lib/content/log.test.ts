import { describe, it, expect } from 'vitest';
import { feed, logPlan, txDay } from './log';
import type { BroadcastManifest } from '@/lib/types';

const e = (id: string, durationSec: number, kind: 'mix' | 'inter' = 'mix') => ({ id, title: 'SECRET', artist: '', date: '', durationSec, file: id, kind, tags: [] });
const at = (h: number, m = 0) => Date.UTC(2026, 4, 19, h + 4, m);   // Eastern (EDT) wall-clock → ms

describe('log', () => {
  it('counts TX from 17 May 2026 (Eastern)', () => {
    expect(txDay(Date.UTC(2026, 4, 17, 12))).toBe('0001');
    expect(txDay(Date.UTC(2026, 4, 18, 3))).toBe('0001');   // still the 17th in New York
  });

  const m: BroadcastManifest = {
    version: 1, entries: [e('a', 3600), e('b', 600, 'inter')],
    schedule: [{ id: 'p1', entry: 'a', start: 6 * 3600, plays: 2 }, { id: 'p2', entry: 'b', start: 8 * 3600, plays: 1 }],
  };
  const plan = logPlan(m);

  it('hands out shape, never titles', () => {
    expect(JSON.stringify(plan)).not.toContain('SECRET');
  });

  it('feeds the day in order, newest last, operator entries mixed in', () => {
    const lines = feed(plan, [{ at: at(7, 30), text: 'Rain on the mast.' }], at(8, 20), 6).map((l) => `${l.tag} ${l.text}`);
    const blk = plan[0].code, int = plan[1].code;
    expect(lines).toEqual([
      'SIG 1000 HZ', `BLK ${blk} ON AIR`, 'OPR Rain on the mast.', 'SIG 1000 HZ', `BLK ${int} INTERMISSION`, '---- OFF AIR',
    ]);
    expect(feed(plan, [], at(8, 20), 99).some((l) => l.text === 'OPEN' && l.tag === 'TX 0003')).toBe(true);
    expect(feed(plan, [], at(9), 1)[0]).toMatchObject({ tag: 'SIG' });   // 09:00 pips land after 08:10 off-air
  });
});
