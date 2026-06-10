/**
 * MP3 duration probing from raw bytes — pure, importable, unit-tested.
 *
 * Used by the broadcast upload route on the uploaded buffer (which carries the whole file, so
 * `totalSize = buffer.length`). Prefers the Xing/Info/VBRI frame count; falls back to a CBR
 * estimate from the first frame's bitrate. This is the spec-correct successor to the layer
 * math in `scripts/probe-durations.mjs` (that standalone dev script is left as-is).
 */

export interface ProbeResult {
  durationSec: number;
  method: string;
  bitrateKbps: number;
  sampleRate: number;
}

// Bitrate (kbps) indexed by [mpegVersion][layer][bitrateIndex].
// mpegVersion: 1 = MPEG1, 2 = MPEG2, 25 = MPEG2.5. layer: 1 | 2 | 3.
const BITRATE: Record<number, Record<number, number[]>> = {
  1: {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  },
  2: {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  },
};
BITRATE[25] = BITRATE[2]; // MPEG2.5 shares the MPEG2 tables

const SAMPLE_RATE: Record<number, number[]> = {
  1: [44100, 48000, 32000, 0],
  2: [22050, 24000, 16000, 0],
  25: [11025, 12000, 8000, 0],
};

interface FrameHeader {
  mpegVersion: number; // 1 | 2 | 25
  layer: number; // 1 | 2 | 3
  bitrateKbps: number;
  sampleRate: number;
  channelMode: number; // 3 = mono
  samplesPerFrame: number;
}

function samplesPerFrame(mpegVersion: number, layer: number): number {
  if (layer === 1) return 384;
  if (layer === 2) return 1152;
  return mpegVersion === 1 ? 1152 : 576; // layer 3
}

/** Parse a 4-byte MPEG audio frame header at `offset`, or null if it isn't a valid frame. */
function parseFrameHeader(buf: Uint8Array, offset: number): FrameHeader | null {
  if (offset + 4 > buf.length) return null;
  const b1 = buf[offset + 1]!, b2 = buf[offset + 2]!, b3 = buf[offset + 3]!;
  if (buf[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;

  const versionBits = (b1 >> 3) & 0x3; // 00=2.5, 01=reserved, 10=2, 11=1
  const layerBits = (b1 >> 1) & 0x3; // 00=reserved, 01=L3, 10=L2, 11=L1
  if (versionBits === 1 || layerBits === 0) return null;

  const mpegVersion = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 25;
  const layer = 4 - layerBits; // L3 bits 01 → 3, L2 → 2, L1 → 1
  const bitrateKbps = BITRATE[mpegVersion]?.[layer]?.[(b2 >> 4) & 0xf] ?? 0;
  const sampleRate = SAMPLE_RATE[mpegVersion]?.[(b2 >> 2) & 0x3] ?? 0;
  if (!bitrateKbps || !sampleRate) return null;

  return {
    mpegVersion,
    layer,
    bitrateKbps,
    sampleRate,
    channelMode: (b3 >> 6) & 0x3,
    samplesPerFrame: samplesPerFrame(mpegVersion, layer),
  };
}

/** Bytes of side information between the frame header and a Xing tag, for Layer III. */
function sideInfoSize(mpegVersion: number, channelMode: number): number {
  if (mpegVersion === 1) return channelMode === 3 ? 17 : 32;
  return channelMode === 3 ? 9 : 17;
}

function skipId3(buf: Uint8Array): number {
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return 10 + ((buf[6]! & 0x7f) << 21) + ((buf[7]! & 0x7f) << 14) + ((buf[8]! & 0x7f) << 7) + (buf[9]! & 0x7f);
  }
  return 0;
}

function findSync(buf: Uint8Array, start: number): { offset: number; hdr: FrameHeader } | null {
  for (let i = start; i < buf.length - 4; i++) {
    if (buf[i] === 0xff && (buf[i + 1]! & 0xe0) === 0xe0) {
      const hdr = parseFrameHeader(buf, i);
      if (hdr) return { offset: i, hdr };
    }
  }
  return null;
}

function readUint32BE(buf: Uint8Array, o: number): number {
  return ((buf[o]! << 24) | (buf[o + 1]! << 16) | (buf[o + 2]! << 8) | buf[o + 3]!) >>> 0;
}

/**
 * Probe duration from a byte buffer. `totalSize` is the full file size (= buffer length when
 * the whole file is in memory) and feeds the CBR fallback when there's no VBR header.
 */
export function probeDurationFromBuffer(buf: Uint8Array, totalSize: number): ProbeResult {
  const found = findSync(buf, skipId3(buf));
  if (!found) throw new Error('no MPEG frame found in buffer');
  const { offset, hdr } = found;

  const tagOffset = offset + 4 + sideInfoSize(hdr.mpegVersion, hdr.channelMode);
  let totalFrames = 0;
  let method = '';

  if (tagOffset + 8 <= buf.length) {
    const tag = String.fromCharCode(buf[tagOffset]!, buf[tagOffset + 1]!, buf[tagOffset + 2]!, buf[tagOffset + 3]!);
    if (tag === 'Xing' || tag === 'Info') {
      const flags = readUint32BE(buf, tagOffset + 4);
      if (flags & 0x1) {
        totalFrames = readUint32BE(buf, tagOffset + 8);
        method = tag;
      }
    } else if (tag === 'VBRI' && tagOffset + 18 <= buf.length) {
      totalFrames = readUint32BE(buf, tagOffset + 14);
      method = 'vbri';
    }
  }

  let durationSec: number;
  if (totalFrames > 0) {
    durationSec = Math.round((totalFrames * hdr.samplesPerFrame) / hdr.sampleRate);
  } else {
    durationSec = Math.round((totalSize - offset) / ((hdr.bitrateKbps * 1000) / 8));
    method = `cbr@${hdr.bitrateKbps}kbps`;
  }

  return { durationSec, method, bitrateKbps: hdr.bitrateKbps, sampleRate: hdr.sampleRate };
}
