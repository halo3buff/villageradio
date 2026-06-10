import { describe, it, expect } from 'vitest';
import { uniqueSuffix } from './ids';

describe('uniqueSuffix', () => {
  it('returns the base unchanged when free', () => {
    expect(uniqueSuffix('red-06-28-2025', [])).toBe('red-06-28-2025');
  });
  it('suffixes b, then c when taken (the seed inter-1b convention)', () => {
    expect(uniqueSuffix('inter-1', ['inter-1'])).toBe('inter-1b');
    expect(uniqueSuffix('inter-1', ['inter-1', 'inter-1b'])).toBe('inter-1c');
  });
  it('falls back to -2, -3 once b..z are exhausted', () => {
    const taken = ['x', ...Array.from({ length: 25 }, (_, i) => 'x' + String.fromCharCode(98 + i))];
    expect(uniqueSuffix('x', taken)).toBe('x-2');
    expect(uniqueSuffix('x', [...taken, 'x-2'])).toBe('x-3');
  });
});
