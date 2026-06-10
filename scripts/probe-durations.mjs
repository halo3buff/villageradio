/**
 * Probes MP3 durations from R2 using byte-range requests.
 * Uses the Xing/Info/VBRI frame count when present, falls back to a CBR estimate.
 * Run: node scripts/probe-durations.mjs
 *
 * The frame-parsing core mirrors the app's runtime prober `src/lib/audio/probe.ts`
 * (kept in sync by hand — the app bundles the .ts; this dev script stays plain .mjs).
 */

const R2 = 'https://pub-fa76dac35d0c4ddf9a81d5267a06b241.r2.dev';

const FILES = [
  'green_04-08-2026.mp3',
  'green_04-10-2026.mp3',
  'green_05-19-2026.mp3',
  'green_05-20-2026.mp3',
  'yellow_02-01-2026.mp3',
  'red_01-15-2026.mp3',
  'red_05-20-2026.mp3',
  'red_06-28-2025.mp3',
  'inter_1.mp3',
  'inter_2.mp3',
  'inter_3.mp3',
  'inter_4.mp3',
  'inter_5.mp3',
];

// Bitrate (kbps) indexed by [mpegVersion][layer][bitrateIndex]. mpegVersion: 1, 2, 25 (=2.5).
const BITRATE = {
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
BITRATE[25] = BITRATE[2];

const SAMPLE_RATE = {
  1: [44100, 48000, 32000, 0],
  2: [22050, 24000, 16000, 0],
  25: [11025, 12000, 8000, 0],
};

// Samples per frame: L1 = 384, L2 = 1152, L3 = 1152 (MPEG1) / 576 (MPEG2/2.5).
function samplesPerFrame(mpegVersion, layer) {
  if (layer === 1) return 384;
  if (layer === 2) return 1152;
  return mpegVersion === 1 ? 1152 : 576;
}

function parseFrameHeader(buf, offset) {
  if (offset + 4 > buf.length) return null;
  const b1 = buf[offset + 1], b2 = buf[offset + 2], b3 = buf[offset + 3];
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

function sideInfoSize(mpegVersion, channelMode) {
  if (mpegVersion === 1) return channelMode === 3 ? 17 : 32;
  return channelMode === 3 ? 9 : 17;
}

function skipId3(buf) {
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return 10 + ((buf[6] & 0x7f) << 21) + ((buf[7] & 0x7f) << 14) + ((buf[8] & 0x7f) << 7) + (buf[9] & 0x7f);
  }
  return 0;
}

function findSync(buf, start) {
  for (let i = start; i < buf.length - 4; i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const hdr = parseFrameHeader(buf, i);
      if (hdr) return { offset: i, hdr };
    }
  }
  return null;
}

function readUint32BE(buf, o) {
  return ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
}

function probeFromBuffer(buf, totalSize) {
  const found = findSync(buf, skipId3(buf));
  if (!found) throw new Error('no MPEG frame found');
  const { offset, hdr } = found;

  const tagOffset = offset + 4 + sideInfoSize(hdr.mpegVersion, hdr.channelMode);
  let totalFrames = 0;
  let method = '';
  if (tagOffset + 8 <= buf.length) {
    const tag = String.fromCharCode(buf[tagOffset], buf[tagOffset + 1], buf[tagOffset + 2], buf[tagOffset + 3]);
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

  let durationSec;
  if (totalFrames > 0) {
    durationSec = Math.round((totalFrames * hdr.samplesPerFrame) / hdr.sampleRate);
  } else {
    durationSec = Math.round((totalSize - offset) / ((hdr.bitrateKbps * 1000) / 8));
    method = `cbr@${hdr.bitrateKbps}kbps`;
  }
  return { durationSec, method, bitrateKbps: hdr.bitrateKbps, sampleRate: hdr.sampleRate };
}

async function probeDuration(filename) {
  const url = `${R2}/${filename}`;
  const head = await fetch(url, { method: 'HEAD' });
  if (!head.ok) throw new Error(`HEAD ${filename}: ${head.status}`);
  const fileSize = parseInt(head.headers.get('content-length') ?? '0', 10);
  if (!fileSize) throw new Error(`No content-length for ${filename}`);

  const rangeRes = await fetch(url, { headers: { Range: 'bytes=0-131071' } });
  if (!rangeRes.ok && rangeRes.status !== 206) throw new Error(`Range GET ${filename}: ${rangeRes.status}`);
  const buf = new Uint8Array(await rangeRes.arrayBuffer());
  return { filename, ...probeFromBuffer(buf, fileSize) };
}

function fmtDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

console.log('Probing durations from R2...\n');

const results = {};
for (const file of FILES) {
  try {
    const r = await probeDuration(file);
    results[file] = r.durationSec;
    console.log(`  ${file.padEnd(28)} ${fmtDur(r.durationSec).padStart(8)}  (${r.durationSec}s)  [${r.method}]`);
  } catch (e) {
    console.error(`  ERROR ${file}: ${e.message}`);
    results[file] = 0;
  }
}

console.log('\n--- durationSec by file ---\n');
for (const [file, sec] of Object.entries(results)) {
  console.log(`  ${file}: ${sec}`);
}
