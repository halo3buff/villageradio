/**
 * Self-check for dsp.ts — run it with `node src/lib/dsp.check.ts` (Node strips
 * the types). Asserts the DSP against values the specs pin down, so a broken
 * FFT normalisation or K-weighting can't quietly ship as a pretty graph.
 */

import assert from 'node:assert/strict';
import { Spectrum, LoudnessMeter, correlation, truePeakDb, peakDb, rmsDb, TestSignal } from './dsp.ts';

const SR = 48000;
const sine = (n: number, hz: number, amp = 1, phase = 0) => {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR + phase);
  return x;
};

// 1. A full-scale sine reads 0 dBFS, in its own bin. The tone is placed at a
//    bin centre — off-centre tones lose up to 1.4 dB to Hann scalloping, which
//    is the window's behaviour, not a normalisation error.
{
  const N = 4096;
  const BIN = 85;                      // 996.09 Hz at 48 kHz
  const spec = new Spectrum(N);
  const out = new Float32Array(N / 2);
  spec.compute(sine(N, (SR * BIN) / N), out);
  let peak = -Infinity, peakBin = -1;
  for (let k = 0; k < out.length; k++) if (out[k] > peak) { peak = out[k]; peakBin = k; }
  assert.equal(peakBin, BIN, `tone should land in bin ${BIN}, got ${peakBin}`);
  assert.ok(Math.abs(peak) < 0.05, `full-scale sine should read 0 dBFS, got ${peak.toFixed(3)}`);
}

// 2. A -20 dBFS sine reads -20 dBFS, and scalloping stays inside the window's
//    theoretical worst case (1.42 dB for Hann).
{
  const N = 4096;
  const BIN = 85;
  const spec = new Spectrum(N);
  const out = new Float32Array(N / 2);
  spec.compute(sine(N, (SR * BIN) / N, 0.1), out);
  assert.ok(Math.abs(Math.max(...out) + 20) < 0.05, `0.1 amplitude should read -20 dBFS, got ${Math.max(...out).toFixed(3)}`);

  spec.compute(sine(N, (SR * (BIN + 0.5)) / N), out);   // worst-case off-centre
  const scallop = Math.max(...out);
  assert.ok(scallop >= -1.45 && scallop < 0, `half-bin offset should lose <1.42 dB, got ${scallop.toFixed(2)}`);
}

// 3. BS.1770: a 1 kHz sine at -20 dBFS in both channels is -20.7 LUFS.
{
  const n = SR * 4;
  const l = sine(n, 1000, 0.1), r = sine(n, 1000, 0.1);
  const m = new LoudnessMeter(SR);
  m.push(l, r);
  const i = m.integrated();
  assert.ok(Math.abs(i + 20.7) < 0.5, `integrated should be ~-20.7 LUFS, got ${i.toFixed(2)}`);
  const st = m.shortTerm();
  assert.ok(Math.abs(st + 20.7) < 0.5, `short-term should be ~-20.7 LUFS, got ${st.toFixed(2)}`);
}

// 4. Correlation: identical = +1, inverted = -1, independent ~ 0.
{
  const a = sine(4096, 440);
  const inv = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) inv[i] = -a[i];
  assert.ok(Math.abs(correlation(a, a) - 1) < 1e-6, 'identical channels should correlate +1');
  assert.ok(Math.abs(correlation(a, inv) + 1) < 1e-6, 'inverted channels should correlate -1');
  const q = sine(4096, 440, 1, Math.PI / 2);
  assert.ok(Math.abs(correlation(a, q)) < 0.05, 'quadrature channels should correlate ~0');
}

// 5. Peak vs true peak: a sine sampled off its crest under-reads on peak,
//    and the oversampled estimate recovers it.
{
  const x = sine(2048, 11000, 1, 0.4);
  const p = peakDb(x), tp = truePeakDb(x);
  assert.ok(tp >= p - 0.01, 'true peak must be at least the sample peak');
  assert.ok(tp > -0.35, `true peak of a full-scale sine should approach 0 dBTP, got ${tp.toFixed(2)}`);
}

// 6. RMS of a full-scale sine pair is -3.01 dBFS.
{
  const a = sine(8192, 1000);
  const v = rmsDb(a, a);
  assert.ok(Math.abs(v + 3.01) < 0.05, `RMS should be ~-3.01 dBFS, got ${v.toFixed(2)}`);
}

// 7. The standby signal is a real, bounded, correlated-but-not-mono signal.
{
  const n = 8192;
  const l = new Float32Array(n), r = new Float32Array(n);
  new TestSignal(SR).render(l, r);
  const p = peakDb(l);
  assert.ok(p < 0, `standby must not clip, peak was ${p.toFixed(2)} dBFS`);
  assert.ok(p > -20, `standby must be audible-level, peak was ${p.toFixed(2)} dBFS`);
  const c = correlation(l, r);
  assert.ok(c > -1 && c < 1, `standby should be neither mono nor inverted, corr ${c.toFixed(3)}`);
  for (let i = 0; i < n; i++) assert.ok(Number.isFinite(l[i]) && Number.isFinite(r[i]), 'standby produced a non-finite sample');
}

console.log('dsp.check: all checks passed');
