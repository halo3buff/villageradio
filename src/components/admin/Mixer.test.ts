import { describe, expect, it } from 'vitest';
import { Mp3Encoder } from '@breezystack/lamejs';
import { layout } from './Mixer';
import { probeDurationFromBuffer } from '@/lib/audio/probe';

const clip = (duration: number, fade = 0, start = 0) => ({ id: 0, name: '', buf: { duration } as AudioBuffer, start, fade, gain: 0, board: false });

describe('mixer', () => {
  it('overlaps each piece with the one before by its fade, after the trim', () => {
    expect(layout([clip(10), clip(20, 4), clip(5, 0, 2)])).toEqual([0, 6, 26]);
  });
  it('encodes a playable mp3', () => {
    const n = 44100 * 3, tone = Int16Array.from({ length: n }, (_, i) => Math.round(8000 * Math.sin(i / 20)));
    const enc = new Mp3Encoder(2, 44100, 192);
    const parts = [enc.encodeBuffer(tone, tone), enc.flush()];
    const bytes = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
    expect(Math.round(probeDurationFromBuffer(bytes, bytes.length).durationSec)).toBe(3);
  });
});
