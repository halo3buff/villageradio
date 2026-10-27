import { describe, expect, it } from 'vitest';
import { advise, bearingKm, waterGap, type Day } from './farm';

const day = (o: Partial<Day>): Day => ({ date: '2026-10-27', max: 24, min: 14, rain: 0, chance: 0, wind: 10, et0: 3, ...o });

describe('farm advice', () => {
  it('picks and sprays on a calm dry day, not on a wet or windy one', () => {
    expect(advise(day({}), day({}))).toEqual({ pick: true, spray: true, frost: false, heat: false });
    expect(advise(day({ rain: 4, chance: 63 }))).toMatchObject({ pick: false, spray: false });
    expect(advise(day({ wind: 20 }))).toMatchObject({ pick: true, spray: false });
    expect(advise(day({}), day({ chance: 70 }))).toMatchObject({ spray: false });   // rain overnight washes it off
    expect(advise(day({ min: 1, max: 36 }))).toMatchObject({ frost: true, heat: true });
  });

  it('sums the week\'s water gap and never goes negative', () => {
    expect(waterGap([day({ et0: 3 }), day({ et0: 3, rain: 1 })])).toBe(5);
    expect(waterGap([day({ et0: 1, rain: 10 })])).toBe(0);
  });

  it('gives distance and compass point', () => {
    const b = bearingKm(35, 32, 35, 32.1);
    expect(b.dir).toBe(0);
    expect(b.km).toBeCloseTo(11.1, 1);
  });
});
