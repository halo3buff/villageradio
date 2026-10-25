// Integrated loudness (ITU-R BS.1770 / EBU R128, the measure Spotify normalises by), so every
// track can play back at the same perceived level. The meter is pure and streaming: feed it
// decoded PCM in pieces, read LUFS at the end.

/** The level every track is played at. Spotify's default. */
export const TARGET_LUFS = -14;

/** Playback trim for a track: loud masters come down to the target; quiet ones are left as
 *  made (no boost, so nothing new can clip and quiet-by-design pieces stay quiet). gainDb is
 *  the admin's own per-track level on top (0 or below). */
export function trimDb(lufs: number | undefined, gainDb = 0): number {
  return (lufs === undefined ? 0 : Math.min(0, TARGET_LUFS - lufs)) + gainDb;
}

/** The station's visuals (Lissajous, bar dots) draw the signal as if it were this much quieter,
 *  so dense, loud passages still leave the figures room to move. Visual only — no readout or
 *  audio changes. */
export const VISUAL_TRIM_DB = -6;

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** BS.1770 K-weighting at any sample rate: a +4 dB high shelf, then a ~38 Hz high-pass.
 *  Same design as libebur128 (what ffmpeg's ebur128 filter uses). */
function kWeighting(fs: number): Biquad[] {
  let K = Math.tan((Math.PI * 1681.974450955533) / fs);
  let Q = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  K = Math.tan((Math.PI * 38.13547087602444) / fs);
  Q = 0.5003270373238773;
  a0 = 1 + K / Q + K * K;
  const highpass = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [shelf, highpass];
}

export class LoudnessMeter {
  private filters: Biquad[];
  private state: Float64Array[]; // per channel: [x1, x2, y1, y2] per stage
  private hop: number; // samples per 100 ms
  private acc = 0; // K-weighted energy (summed over channels) in the current 100 ms
  private n = 0;
  private subs: number[] = []; // 100 ms energies (mean square, channel-summed)

  constructor(fs: number, channels: number) {
    this.filters = kWeighting(fs);
    this.state = Array.from({ length: channels }, () => new Float64Array(8));
    this.hop = Math.round(fs / 10);
  }

  /** Decoded samples, one array per channel, all the same length. */
  push(chans: Float32Array[]) {
    const len = chans[0].length;
    for (let i = 0; i < len; i++) {
      let e = 0;
      for (let c = 0; c < chans.length; c++) {
        let x = chans[c][i];
        const s = this.state[c];
        for (let k = 0; k < 2; k++) {
          const f = this.filters[k], o = k * 4;
          const y = f.b0 * x + f.b1 * s[o] + f.b2 * s[o + 1] - f.a1 * s[o + 2] - f.a2 * s[o + 3];
          s[o + 1] = s[o]; s[o] = x; s[o + 3] = s[o + 2]; s[o + 2] = y;
          x = y;
        }
        e += x * x;
      }
      this.acc += e;
      if (++this.n === this.hop) {
        this.subs.push(this.acc / this.hop);
        this.acc = 0;
        this.n = 0;
      }
    }
  }

  /** Gated integrated loudness in LUFS (-Infinity for silence). */
  lufs(): number {
    // 400 ms blocks, 75% overlap = four consecutive 100 ms energies
    const blocks: number[] = [];
    for (let i = 3; i < this.subs.length; i++) blocks.push((this.subs[i] + this.subs[i - 1] + this.subs[i - 2] + this.subs[i - 3]) / 4);
    const L = (z: number) => -0.691 + 10 * Math.log10(z);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const abs = blocks.filter((z) => L(z) > -70);
    if (!abs.length) return -Infinity;
    const rel = L(mean(abs)) - 10;
    const gated = abs.filter((z) => L(z) > rel);
    return L(mean(gated));
  }
}

const CHUNK = 4 << 20; // decode 4 MB of MP3 at a time — a 30-minute mix never sits in memory whole

type Reader = { size: number; read: (start: number, end: number) => Promise<ArrayBuffer> };

/** A local file (an upload being added). */
export const fileReader = (file: Blob): Reader => ({
  size: file.size,
  read: (a, b) => file.slice(a, b).arrayBuffer(),
});

/** A file already in storage, read back in ranges (the stream proxy serves bounded windows). */
export async function urlReader(url: string): Promise<Reader> {
  const head = await fetch(url, { headers: { Range: 'bytes=0-0' } });
  const size = Number(head.headers.get('Content-Range')?.split('/')[1]);
  if (!head.ok || !size) throw new Error(`no size for ${url}`);
  return {
    size,
    read: async (a, b) => {
      const res = await fetch(url, { headers: { Range: `bytes=${a}-${b - 1}` } });
      if (!res.ok) throw new Error(String(res.status));
      return res.arrayBuffer();
    },
  };
}

/** Integrated loudness of a whole audio file, rounded to 0.1 LU. Browser only. */
export async function measureLoudness(src: Reader, onProgress?: (f: number) => void): Promise<number> {
  const ctx = new OfflineAudioContext(2, 1, 44_100);
  let meter: LoudnessMeter | null = null;
  for (let off = 0; off < src.size; off += CHUNK) {
    // MP3 frames resync on their own, so each slice decodes independently
    const buf = await ctx.decodeAudioData(await src.read(off, Math.min(off + CHUNK, src.size))).catch(() => null);
    if (buf) {
      meter ??= new LoudnessMeter(buf.sampleRate, buf.numberOfChannels);
      meter.push(Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)));
    }
    onProgress?.(Math.min(1, (off + CHUNK) / src.size));
  }
  if (!meter) throw new Error('could not decode');
  return Math.round(meter.lufs() * 10) / 10;
}
