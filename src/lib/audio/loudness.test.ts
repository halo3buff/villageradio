import { describe, it, expect } from 'vitest';
import { LoudnessMeter, trimDb } from './loudness';

describe('LoudnessMeter', () => {
  // EBU Tech 3341 case 1: stereo 1 kHz sine at -23 dBFS reads -23.0 LUFS
  it('reads the EBU reference tone', () => {
    for (const fs of [44_100, 48_000]) {
      const n = fs * 20, a = 10 ** (-23 / 20);
      const x = Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * 1000 * i) / fs));
      const m = new LoudnessMeter(fs, 2);
      m.push([x.subarray(0, n / 2), x.subarray(0, n / 2)]);
      m.push([x.subarray(n / 2), x.subarray(n / 2)]); // streamed in two pieces
      expect(m.lufs()).toBeCloseTo(-23, 1);
    }
  });

  it('gates out silence', () => {
    const fs = 48_000, a = 10 ** (-23 / 20);
    const tone = Float32Array.from({ length: fs * 10 }, (_, i) => a * Math.sin((2 * Math.PI * 1000 * i) / fs));
    const m = new LoudnessMeter(fs, 2);
    m.push([tone, tone]);
    m.push([new Float32Array(fs * 10), new Float32Array(fs * 10)]);
    expect(Math.abs(m.lufs() + 23)).toBeLessThan(0.1); // blocks straddling the edge count, as in any meter
  });
});

describe('trimDb', () => {
  it('turns loud masters down to -14 and leaves quiet ones alone', () => {
    expect(trimDb(-7.4)).toBeCloseTo(-6.6);
    expect(trimDb(-20)).toBe(0);
    expect(trimDb(undefined)).toBe(0);
    expect(trimDb(-7.4, -2)).toBeCloseTo(-8.6); // admin level stacks on top
    expect(trimDb(-20, -3)).toBe(-3);
  });
});
