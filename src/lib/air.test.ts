import { describe, expect, it } from 'vitest';
import { aircraft } from './air';

describe('aircraft', () => {
  it('keeps positioned contacts in the box and reads the military flag', () => {
    const out = aircraft([
      { hex: 'a', flight: 'ELY1 ', lat: 32, lon: 34.8, alt_baro: 30000, gs: 400, track: 90, dbFlags: 0 },
      { hex: 'b', t: 'C130', lat: 31.4, lon: 34.2, alt_baro: 'ground', dbFlags: 1 },
      { hex: 'c', lat: 40, lon: 34 },   // outside
      { hex: 'd' },                     // no position
    ]);
    expect(out.map(a => [a.hex, a.flight, a.alt, a.mil])).toEqual([['a', 'ELY1', 30000, false], ['b', '', 0, true]]);
  });
});
