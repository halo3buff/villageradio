/**
 * Probes MP3 durations from R2 using byte-range requests.
 * Uses Xing/Info VBR header when present, falls back to CBR estimate.
 * Run: node scripts/probe-durations.mjs
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

// MPEG bitrate table indexed by [version][layer][bitrateIndex]
// version: 0=MPEG2.5, 2=MPEG2, 3=MPEG1
// layer: 1=L3, 2=L2, 3=L1
const BITRATE_TABLE = {
  3: { 1: [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0], 2: [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384,0], 3: [0,32,64,96,128,160,192,224,256,288,320,352,384,416,448,0] },
  2: { 1: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],  2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],  3: [0,32,48,56,64,80,96,112,128,144,160,176,192,224,256,0] },
  0: { 1: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],  2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0],  3: [0,32,48,56,64,80,96,112,128,144,160,176,192,224,256,0] },
};

const SAMPLE_RATE_TABLE = {
  3: [44100, 48000, 32000, 0],
  2: [22050, 24000, 16000, 0],
  0: [11025, 12000, 8000,  0],
};

// Samples per frame: MPEG1/L3 = 1152, MPEG2/2.5/L3 = 576
function samplesPerFrame(version, layer) {
  if (layer === 1) return version === 3 ? 1152 : 576; // L3
  if (layer === 2) return 1152; // L2
  return 384; // L1
}

// Side information size for L3 (bytes after 4-byte header, before Xing)
function sideInfoSize(version, channelMode) {
  if (version === 3) return channelMode === 3 ? 17 : 32; // MPEG1: mono=17, stereo=32
  return channelMode === 3 ? 9 : 17; // MPEG2/2.5: mono=9, stereo=17
}

function parseFrameHeader(buf, offset) {
  if (offset + 4 > buf.length) return null;
  const b0 = buf[offset], b1 = buf[offset+1], b2 = buf[offset+2], b3 = buf[offset+3];

  // Sync: first 11 bits must be 1
  if (b0 !== 0xFF || (b1 & 0xE0) !== 0xE0) return null;

  const version     = (b1 >> 3) & 0x3; // 0=2.5, 1=reserved, 2=2, 3=1
  const layer       = 4 - ((b1 >> 1) & 0x3); // 1=L3, 2=L2, 3=L1 (inverted)
  const bitrateIdx  = (b2 >> 4) & 0xF;
  const sampleIdx   = (b2 >> 2) & 0x3;
  const padding     = (b2 >> 1) & 0x1;
  const channelMode = (b3 >> 6) & 0x3; // 3=mono

  if (version === 1) return null; // reserved
  if (layer > 3 || layer < 1) return null;

  const bitrateKbps = (BITRATE_TABLE[version]?.[layer]?.[bitrateIdx]) ?? 0;
  const sampleRate  = (SAMPLE_RATE_TABLE[version]?.[sampleIdx]) ?? 0;

  if (!bitrateKbps || !sampleRate) return null;

  const spf = samplesPerFrame(version, layer);
  const frameSize = layer === 3
    ? Math.floor(12 * bitrateKbps * 1000 / sampleRate + padding) * 4
    : Math.floor(144 * bitrateKbps * 1000 / sampleRate) + padding;

  return { version, layer, bitrateKbps, sampleRate, padding, channelMode, spf, frameSize };
}

function skipId3(buf) {
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) { // "ID3"
    const size =
      ((buf[6] & 0x7F) << 21) |
      ((buf[7] & 0x7F) << 14) |
      ((buf[8] & 0x7F) <<  7) |
       (buf[9] & 0x7F);
    return 10 + size;
  }
  return 0;
}

// Find first valid MPEG sync word within buf, starting at start
function findSync(buf, start = 0) {
  for (let i = start; i < buf.length - 4; i++) {
    if (buf[i] === 0xFF && (buf[i+1] & 0xE0) === 0xE0) {
      const hdr = parseFrameHeader(buf, i);
      if (hdr) return { offset: i, hdr };
    }
  }
  return null;
}

function readUint32BE(buf, offset) {
  return ((buf[offset] << 24) | (buf[offset+1] << 16) | (buf[offset+2] << 8) | buf[offset+3]) >>> 0;
}

async function probeDuration(filename) {
  const url = `${R2}/${filename}`;

  // HEAD to get file size
  const head = await fetch(url, { method: 'HEAD' });
  if (!head.ok) throw new Error(`HEAD ${filename}: ${head.status}`);
  const fileSize = parseInt(head.headers.get('content-length') ?? '0', 10);
  if (!fileSize) throw new Error(`No content-length for ${filename}`);

  // Fetch first 128 KB
  const rangeRes = await fetch(url, { headers: { Range: 'bytes=0-131071' } });
  if (!rangeRes.ok && rangeRes.status !== 206) throw new Error(`Range GET ${filename}: ${rangeRes.status}`);
  const arrayBuf = await rangeRes.arrayBuffer();
  const buf = new Uint8Array(arrayBuf);

  // Skip ID3 header
  let start = skipId3(buf);

  // Find first MPEG sync
  const found = findSync(buf, start);
  if (!found) throw new Error(`No MPEG sync in ${filename}`);
  const { offset: frameOffset, hdr } = found;

  // Check for Xing / Info / VBRI header in first frame
  const xingOffset = frameOffset + 4 + sideInfoSize(hdr.version, hdr.channelMode);

  let totalFrames = 0;
  let method = 'cbr';

  if (xingOffset + 8 <= buf.length) {
    const tag = String.fromCharCode(buf[xingOffset], buf[xingOffset+1], buf[xingOffset+2], buf[xingOffset+3]);
    if (tag === 'Xing' || tag === 'Info') {
      const flags = readUint32BE(buf, xingOffset + 4);
      if (flags & 0x1) {
        totalFrames = readUint32BE(buf, xingOffset + 8);
        method = tag;
      }
    } else if (tag === 'VBRI') {
      // VBRI header: version(2) + delay(2) + quality(2) + bytes(4) + frames(4)
      if (xingOffset + 18 <= buf.length) {
        totalFrames = readUint32BE(buf, xingOffset + 14);
        method = 'vbri';
      }
    }
  }

  let durationSec;
  if (totalFrames > 0) {
    durationSec = Math.round(totalFrames * hdr.spf / hdr.sampleRate);
  } else {
    // CBR estimate: (fileSize - audio_start) / (bitrate_bytes_per_sec)
    const audioBytesPerSec = hdr.bitrateKbps * 1000 / 8;
    const audioBytes = fileSize - frameOffset;
    durationSec = Math.round(audioBytes / audioBytesPerSec);
    method = `cbr@${hdr.bitrateKbps}kbps`;
  }

  return { filename, durationSec, method, bitrateKbps: hdr.bitrateKbps, sampleRate: hdr.sampleRate };
}

function fmtDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
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

console.log('\n--- Copy into mixes.ts ---\n');
for (const [file, sec] of Object.entries(results)) {
  console.log(`  ${file}: ${sec}`);
}
