import { describe, it, expect } from 'vitest';
import { advance } from './key-sequence';

const SEQ = ['a', 'b', 'c']; // distinct elements make the reset/restart cases unambiguous

describe('advance', () => {
  it('advances one step on the expected key', () => {
    expect(advance(0, 'a', SEQ)).toBe(1);
    expect(advance(1, 'b', SEQ)).toBe(2);
    expect(advance(2, 'c', SEQ)).toBe(3); // 3 === SEQ.length → caller treats as complete
  });

  it('completes a full correct run', () => {
    let pos = 0;
    for (const k of SEQ) pos = advance(pos, k, SEQ);
    expect(pos).toBe(SEQ.length);
  });

  it('resets to 0 on a wrong key', () => {
    expect(advance(1, 'x', SEQ)).toBe(0);
    expect(advance(2, 'x', SEQ)).toBe(0);
  });

  it('restarts at 1 when the wrong key equals the first key', () => {
    expect(advance(2, 'a', SEQ)).toBe(1); // expected 'c', got the first key 'a'
    expect(advance(1, 'a', SEQ)).toBe(1);
  });

  it('handles a repeated-first-element sequence (the real arrow pattern)', () => {
    const ARROWS = ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowDown'];
    let pos = 0;
    for (const k of ARROWS) pos = advance(pos, k, ARROWS);
    expect(pos).toBe(ARROWS.length);
    // a stray ArrowRight mid-run keeps progress sane (it's the first key → restart at 1)
    expect(advance(3, 'ArrowRight', ARROWS)).toBe(1); // expected ArrowLeft, got ArrowRight
  });
});
