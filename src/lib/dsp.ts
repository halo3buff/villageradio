/**
 * dsp.ts — the real signal processing behind the broadcast console.
 *
 * Everything the console displays is computed here from actual samples: a
 * windowed radix-2 FFT for the spectrum, ITU-R BS.1770-4 K-weighted loudness
 * for LUFS/LRA, an oversampled true-peak estimate, and a real inter-channel
 * correlation. The standby generator is a genuine signal (log sweep + pink
 * noise + a slow phase rotation), so standby and live run the identical
 * analysis path rather than the display drawing decorative curves.
 */

// ── FFT ────────────────────────────────────────────────────────────────────

/** In-place iterative radix-2 Cooley-Tukey. `re`/`im` must be a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error('fft: length must be a power of two');

  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + (len >> 1)] * cr - im[i + k + (len >> 1)] * ci;
        const vi = re[i + k + (len >> 1)] * ci + im[i + k + (len >> 1)] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + (len >> 1)] = ur - vr; im[i + k + (len >> 1)] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

export function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/**
 * Windowed magnitude spectrum in dBFS, normalised so a full-scale sine reads
 * 0 dBFS at its bin (2/(N * coherent gain), Hann coherent gain = 0.5).
 * Writes `out.length = n/2` bins.
 */
export class Spectrum {
  private re: Float32Array;
  private im: Float32Array;
  private win: Float32Array;
  readonly bins: number;
  readonly size: number;

  constructor(size: number) {
    this.size = size;
    this.re = new Float32Array(size);
    this.im = new Float32Array(size);
    this.win = hannWindow(size);
    this.bins = size >> 1;
  }

  /** @param out dBFS per bin, floored at `floorDb`. */
  compute(samples: Float32Array, out: Float32Array, floorDb = -120): void {
    this.computeComplex(samples, this.re, this.im);
    const norm = 2 / (this.size * 0.5);
    for (let k = 0; k < this.bins; k++) {
      const mag = Math.hypot(this.re[k], this.im[k]) * norm;
      out[k] = mag > 0 ? Math.max(floorDb, 20 * Math.log10(mag)) : floorDb;
    }
  }

  /** Windowed complex spectrum, for work that needs phase (cross-spectra). */
  computeComplex(samples: Float32Array, re: Float32Array, im: Float32Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) { re[i] = samples[i] * this.win[i]; im[i] = 0; }
    fft(re, im);
  }
}

/**
 * Normalised cross-spectrum over a bin range: the band's inter-channel
 * coherence, signed by the real part. +1 in phase, 0 uncorrelated, -1 out of
 * phase — the per-band version of the correlation meter.
 */
export function bandCoherence(
  reL: Float32Array, imL: Float32Array, reR: Float32Array, imR: Float32Array,
  lo: number, hi: number,
): number {
  let cr = 0, ci = 0, pl = 0, pr = 0;
  for (let k = lo; k <= hi; k++) {
    cr += reL[k] * reR[k] + imL[k] * imR[k];      // Re(L * conj(R))
    ci += imL[k] * reR[k] - reL[k] * imR[k];      // Im(L * conj(R))
    pl += reL[k] * reL[k] + imL[k] * imL[k];
    pr += reR[k] * reR[k] + imR[k] * imR[k];
  }
  if (pl <= 0 || pr <= 0) return 0;
  const mag = Math.hypot(cr, ci) / Math.sqrt(pl * pr);
  return Math.max(-1, Math.min(1, cr < 0 ? -mag : mag));
}

/** ISO third-octave band centres, 20 Hz to 20 kHz. */
export const THIRD_OCTAVE = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
];

/** Band power in dBFS, summed over the bins inside the band's edges. */
export function bandLevelDb(
  reX: Float32Array, imX: Float32Array, fc: number, sampleRate: number, fftSize: number,
): number {
  const edge = Math.pow(2, 1 / 6);
  const binOf = (hz: number) => (hz / sampleRate) * fftSize;
  const lo = Math.max(1, Math.floor(binOf(fc / edge)));
  const hi = Math.min((fftSize >> 1) - 1, Math.ceil(binOf(fc * edge)));
  if (hi < lo) return -120;
  let p = 0;
  const norm = 2 / (fftSize * 0.5);
  for (let k = lo; k <= hi; k++) {
    const m = Math.hypot(reX[k], imX[k]) * norm;
    p += m * m;
  }
  return p > 0 ? Math.max(-120, 10 * Math.log10(p)) : -120;
}

/** Least-squares slope of level against log2(frequency), in dB per octave. */
export function spectralSlopeDbPerOct(levels: number[], centres: number[]): number {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] <= -110) continue;
    const x = Math.log2(centres[i]);
    n++; sx += x; sy += levels[i]; sxx += x * x; sxy += x * levels[i];
  }
  if (n < 3) return 0;
  const d = n * sxx - sx * sx;
  return d === 0 ? 0 : (n * sxy - sx * sy) / d;
}

// ── biquads (RBJ cookbook), used for K-weighting ───────────────────────────

export class Biquad {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private b0: number; private b1: number; private b2: number;
  private a1: number; private a2: number;

  constructor(b0: number, b1: number, b2: number, a1: number, a2: number) {
    this.b0 = b0; this.b1 = b1; this.b2 = b2; this.a1 = a1; this.a2 = a2;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }

  reset(): void { this.x1 = this.x2 = this.y1 = this.y2 = 0; }

  /** BS.1770 stage 1: high shelf, +4 dB at 1681.97 Hz. */
  static kShelf(sampleRate: number): Biquad {
    const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    const A = Math.pow(10, G / 40);
    const w0 = (2 * Math.PI * f0) / sampleRate;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * Q);
    const sq = 2 * Math.sqrt(A) * alpha;
    const b0 = A * ((A + 1) + (A - 1) * cw + sq);
    const b1 = -2 * A * ((A - 1) + (A + 1) * cw);
    const b2 = A * ((A + 1) + (A - 1) * cw - sq);
    const a0 = (A + 1) - (A - 1) * cw + sq;
    const a1 = 2 * ((A - 1) - (A + 1) * cw);
    const a2 = (A + 1) - (A - 1) * cw - sq;
    return new Biquad(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
  }

  /** BS.1770 stage 2: RLB high-pass at 38.13 Hz. */
  static kHighpass(sampleRate: number): Biquad {
    const f0 = 38.13547087602444, Q = 0.5003270373238773;
    const w0 = (2 * Math.PI * f0) / sampleRate;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * Q);
    const b0 = (1 + cw) / 2, b1 = -(1 + cw), b2 = (1 + cw) / 2;
    const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
    return new Biquad(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
  }
}

// ── loudness (ITU-R BS.1770-4 / EBU R128) ──────────────────────────────────

const ABS_GATE = -70;        // LUFS, absolute gate
const REL_GATE_LU = -10;     // LU below the ungated mean

/**
 * Streaming loudness meter: momentary (400 ms), short-term (3 s), gated
 * integrated loudness, and LRA from the 10th/95th percentile of short-term.
 */
export class LoudnessMeter {
  private shelfL: Biquad; private hpL: Biquad;
  private shelfR: Biquad; private hpR: Biquad;
  private blockLen: number;          // 100 ms — momentary is 4 of these
  private acc = 0;                   // summed K-weighted mean square in-block
  private accN = 0;
  private blocks: number[] = [];     // 100 ms mean squares, newest last
  private stHistory: number[] = [];  // short-term LUFS values for LRA

  constructor(sampleRate: number) {
    this.shelfL = Biquad.kShelf(sampleRate); this.hpL = Biquad.kHighpass(sampleRate);
    this.shelfR = Biquad.kShelf(sampleRate); this.hpR = Biquad.kHighpass(sampleRate);
    this.blockLen = Math.round(sampleRate * 0.1);
  }

  push(l: Float32Array, r: Float32Array, count = l.length): void {
    for (let i = 0; i < count; i++) {
      const kl = this.hpL.process(this.shelfL.process(l[i]));
      const kr = this.hpR.process(this.shelfR.process(r[i]));
      this.acc += kl * kl + kr * kr;    // channel weights G = 1.0 for L/R
      this.accN++;
      if (this.accN >= this.blockLen) {
        this.blocks.push(this.acc / this.accN);
        this.acc = 0; this.accN = 0;
        if (this.blocks.length > 6000) this.blocks.shift();   // ~10 min
        const st = this.window(30);
        if (st > ABS_GATE) {
          this.stHistory.push(st);
          if (this.stHistory.length > 3000) this.stHistory.shift();
        }
      }
    }
  }

  /** Loudness over the last `n` 100 ms blocks, in LUFS. */
  private window(n: number): number {
    const take = Math.min(n, this.blocks.length);
    if (!take) return -Infinity;
    let s = 0;
    for (let i = this.blocks.length - take; i < this.blocks.length; i++) s += this.blocks[i];
    return LoudnessMeter.lufs(s / take);
  }

  private static lufs(meanSquare: number): number {
    return meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -Infinity;
  }

  momentary(): number { return this.window(4); }
  shortTerm(): number { return this.window(30); }

  /** Gated integrated loudness over everything pushed so far. */
  integrated(): number {
    if (!this.blocks.length) return -Infinity;
    // absolute gate
    const above: number[] = [];
    for (const ms of this.blocks) if (LoudnessMeter.lufs(ms) > ABS_GATE) above.push(ms);
    if (!above.length) return -Infinity;
    const mean = above.reduce((a, b) => a + b, 0) / above.length;
    const rel = LoudnessMeter.lufs(mean) + REL_GATE_LU;
    const kept = above.filter(ms => LoudnessMeter.lufs(ms) > rel);
    if (!kept.length) return LoudnessMeter.lufs(mean);
    return LoudnessMeter.lufs(kept.reduce((a, b) => a + b, 0) / kept.length);
  }

  /** EBU R128 loudness range, in LU. */
  range(): number {
    if (this.stHistory.length < 10) return 0;
    const sorted = [...this.stHistory].sort((a, b) => a - b);
    const gate = sorted[Math.floor(sorted.length * 0.5)] - 20;
    const kept = sorted.filter(v => v > gate);
    if (kept.length < 2) return 0;
    const lo = kept[Math.floor(kept.length * 0.1)];
    const hi = kept[Math.min(kept.length - 1, Math.floor(kept.length * 0.95))];
    return hi - lo;
  }
}

// ── peak / true peak / correlation ─────────────────────────────────────────

export function peakDb(x: Float32Array, count = x.length): number {
  let p = 0;
  for (let i = 0; i < count; i++) { const a = Math.abs(x[i]); if (a > p) p = a; }
  return p > 0 ? 20 * Math.log10(p) : -Infinity;
}

/**
 * True-peak estimate: 4x oversample with Catmull-Rom interpolation, which
 * catches most inter-sample overs a plain sample peak misses.
 */
export function truePeakDb(x: Float32Array, count = x.length): number {
  let p = 0;
  for (let i = 1; i + 2 < count; i++) {
    const p0 = x[i - 1], p1 = x[i], p2 = x[i + 1], p3 = x[i + 2];
    for (let s = 0; s < 4; s++) {
      const t = s / 4;
      const v = 0.5 * ((2 * p1) + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
      const a = Math.abs(v);
      if (a > p) p = a;
    }
  }
  return p > 0 ? 20 * Math.log10(p) : -Infinity;
}

export function rmsDb(l: Float32Array, r: Float32Array, count = l.length): number {
  let s = 0;
  for (let i = 0; i < count; i++) s += l[i] * l[i] + r[i] * r[i];
  const ms = s / (2 * Math.max(1, count));
  return ms > 0 ? 10 * Math.log10(ms) : -Infinity;
}

/** Pearson correlation between channels: +1 mono, 0 uncorrelated, -1 inverted. */
export function correlation(l: Float32Array, r: Float32Array, count = l.length): number {
  let sll = 0, srr = 0, slr = 0;
  for (let i = 0; i < count; i++) { sll += l[i] * l[i]; srr += r[i] * r[i]; slr += l[i] * r[i]; }
  if (sll <= 0 || srr <= 0) return 1;
  return Math.max(-1, Math.min(1, slr / Math.sqrt(sll * srr)));
}

// ── standby test signal ────────────────────────────────────────────────────

/** Paul Kellett's pink filter over white noise — real -3 dB/octave noise. */
class Pink {
  private b = new Float64Array(7);
  next(): number {
    const w = Math.random() * 2 - 1;
    const b = this.b;
    b[0] = 0.99886 * b[0] + w * 0.0555179;
    b[1] = 0.99332 * b[1] + w * 0.0750759;
    b[2] = 0.96900 * b[2] + w * 0.1538520;
    b[3] = 0.86650 * b[3] + w * 0.3104856;
    b[4] = 0.55000 * b[4] + w * 0.5329522;
    b[5] = -0.7616 * b[5] - w * 0.0168980;
    const out = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362;
    b[6] = w * 0.115926;
    return out * 0.11;
  }
}

/**
 * Standby signal: what a broadcast chain actually parks on — a slow
 * logarithmic sweep over a pink noise floor, with the right channel phase
 * rotating so the goniometer traces a real, slowly opening ellipse.
 *
 * It is generated sample by sample and then measured by the same analysis
 * path as live audio, so every panel agrees with every other panel.
 */
export class TestSignal {
  private phase = 0;          // sweep oscillator phase, radians
  private sweepT = 0;         // seconds through the sweep
  private pinkL = new Pink();
  private pinkR = new Pink();
  private rot = 0;

  private sampleRate: number;
  private sweepSeconds: number;
  private fLo: number;
  private fHi: number;

  constructor(sampleRate: number, sweepSeconds = 24, fLo = 30, fHi = 16000) {
    this.sampleRate = sampleRate;
    this.sweepSeconds = sweepSeconds;
    this.fLo = fLo;
    this.fHi = fHi;
  }

  /** Fill `l`/`r` with the next `count` samples. */
  render(l: Float32Array, r: Float32Array, count = l.length): void {
    const dt = 1 / this.sampleRate;
    const ratio = this.fHi / this.fLo;
    for (let i = 0; i < count; i++) {
      const u = this.sweepT / this.sweepSeconds;
      const hz = this.fLo * Math.pow(ratio, u);
      this.phase += 2 * Math.PI * hz * dt;
      if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
      this.sweepT += dt;
      if (this.sweepT >= this.sweepSeconds) this.sweepT = 0;

      this.rot += dt * 0.11;                       // one rotation per ~57 s
      const spread = 0.55 + 0.45 * Math.sin(this.rot);
      const tone = Math.sin(this.phase) * 0.2;     // -14 dBFS sweep
      const nL = this.pinkL.next() * 0.06;         // ~-30 dBFS noise floor
      const nR = this.pinkR.next() * 0.06;
      l[i] = tone + nL;
      r[i] = Math.sin(this.phase + spread * 1.4) * 0.2 + nR;
    }
  }
}
