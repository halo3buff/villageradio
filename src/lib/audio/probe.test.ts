import { describe, it, expect } from 'vitest';
import { probeDurationFromBuffer } from './probe';

// MPEG1 Layer III frame header. bitrateIdx 9 = 128 kbps; sampleIdx 0 = 44100 Hz; stereo.
function mpeg1L3Header(bitrateIdx: number, sampleIdx = 0, padding = 0): number[] {
  const b1 = 0xfb; // 11=MPEG1, 01=Layer III, 1=no CRC
  const b2 = ((bitrateIdx & 0xf) << 4) | ((sampleIdx & 0x3) << 2) | ((padding & 1) << 1);
  const b3 = 0x00; // channel mode 00 = stereo
  return [0xff, b1, b2, b3];
}
const u8 = (...parts: number[][]) => new Uint8Array(parts.flat());

describe('probeDurationFromBuffer — CBR', () => {
  it('estimates duration from total size and the frame bitrate', () => {
    const buf = u8(mpeg1L3Header(9), [0, 0, 0, 0, 0, 0, 0, 0]); // no Xing in range
    const totalSize = 16000 * 30; // 128 kbps = 16000 bytes/s → 30 s
    const r = probeDurationFromBuffer(buf, totalSize);
    expect(r.bitrateKbps).toBe(128);
    expect(r.sampleRate).toBe(44100);
    expect(r.durationSec).toBe(30);
    expect(r.method).toMatch(/cbr/i);
  });
});

describe('probeDurationFromBuffer — Xing VBR', () => {
  it('uses the Xing frame count when present', () => {
    const buf = u8(
      mpeg1L3Header(9),
      new Array(32).fill(0), // side info
      [0x58, 0x69, 0x6e, 0x67], // "Xing"
      [0, 0, 0, 0x01], // flags: frames present
      [0, 0, 0x03, 0xe8], // 1000 frames
    );
    const r = probeDurationFromBuffer(buf, 999999);
    // 1000 frames * 1152 samples / 44100 Hz ≈ 26.1 s
    expect(r.durationSec).toBe(26);
    expect(r.method).toBe('Xing');
  });
});

describe('probeDurationFromBuffer — VBRI', () => {
  it('uses the VBRI frame count when present', () => {
    const buf = u8(
      mpeg1L3Header(9),
      new Array(32).fill(0),
      [0x56, 0x42, 0x52, 0x49], // "VBRI"
      new Array(10).fill(0), // version+delay+quality+bytes
      [0, 0, 0x07, 0xd0], // 2000 frames
    );
    const r = probeDurationFromBuffer(buf, 999999);
    // 2000 * 1152 / 44100 ≈ 52.2 s
    expect(r.durationSec).toBe(52);
    expect(r.method).toBe('vbri');
  });
});

describe('probeDurationFromBuffer — ID3', () => {
  it('skips an ID3v2 header before finding the first frame', () => {
    const id3 = [0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 100]; // size 100 (synchsafe)
    const buf = u8(id3, new Array(100).fill(0), mpeg1L3Header(9), [0, 0, 0, 0, 0, 0, 0, 0]);
    const totalSize = 110 + 16000 * 10; // frame starts at byte 110
    const r = probeDurationFromBuffer(buf, totalSize);
    expect(r.durationSec).toBe(10);
  });
});

describe('probeDurationFromBuffer — no sync', () => {
  it('throws when no MPEG frame is found', () => {
    expect(() => probeDurationFromBuffer(new Uint8Array(64), 1000)).toThrow(/no mpeg/i);
  });
});
