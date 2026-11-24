import { describe, expect, it } from 'vitest';
import { Mp3Encoder } from '@breezystack/lamejs';
import { autoFades, envelope, duckPoints, audible, type Clip } from './mixer-core';
import { probeDurationFromBuffer } from '@/lib/audio/probe';

const clip = (id: number, at: number, dur: number, board = false): Clip => ({
  id, name: '', lane: 1, board, at, inT: 0, outT: dur, fadeIn: 0, fadeOut: 0, autoIn: true, autoOut: true, gain: 0,
  buf: { duration: dur } as AudioBuffer, peaks: new Float32Array(0),
});

describe('mixer', () => {
  it('crossfades overlapping songs over exactly the overlap', () => {
    const [a, b] = autoFades([clip(1, 0, 30), clip(2, 22, 30)]);
    expect([a.fadeIn, a.fadeOut, b.fadeIn, b.fadeOut]).toEqual([0, 8, 8, 0]);
  });
  it('ramps the volume through its fades', () => {
    expect(envelope({ ...clip(1, 10, 20), fadeIn: 2, fadeOut: 4 })).toEqual([[10, 0], [12, 1], [26, 1], [30, 0]]);
  });
  it('dips a song under a board sound', () => {
    expect(duckPoints([clip(1, 0, 60), clip(2, 5, 10, true)], clip(1, 0, 60), 20)).toEqual([[4.7, 1], [5, 0.1], [15, 0.1], [15.6, 1]]);
  });
  it('skips silence at the ends', () => {
    const p = new Float32Array(500); p.fill(0.5, 100, 400);
    expect(audible(p)).toEqual([1.96, 8.04]);
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
