import { describe, expect, it } from 'vitest';
import { inside, nearest, row, type Place } from './fires';

describe('fires', () => {
  it('parses a FIRMS row in the box and drops one outside it', () => {
    expect(row('31.5,34.45,330.1,0.4,0.4,2026-10-26,0947,N20,n,2.0NRT,290.2,12.3,D')).toEqual({
      lat: 31.5, lon: 34.45, frp: 12.3, sat: 'N20', conf: 'n', t: Date.parse('2026-10-26T09:47:00Z') / 1000,
    });
    expect(row('40.1,30.2,330,0.4,0.4,2026-10-26,947,N,n,2.0NRT,290,1,D')).toBeNull();
    expect(row('latitude,longitude,bright_ti4')).toBeNull();
  });

  it('tells inside from outside, holes included', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const hole: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
    expect(inside([sq], 2, 2)).toBe(true);
    expect(inside([sq, hole], 5, 5)).toBe(false);
    expect(inside([sq], 11, 5)).toBe(false);
  });

  it('names the nearest place, the distance and the direction from it', () => {
    const places: Place[] = [['Far', 'ب', 35.5, 32.5, 2, 'X', 0], ['Rafah', 'رفح', 34.25, 31.3, 0, 'Rafah', 1]];
    const n = nearest(places, 34.25, 31.32)!;
    expect(n.en).toBe('Rafah');
    expect(n.dir).toBe('N');
    expect(n.km).toBeCloseTo(2.2, 1);
  });
});
