'use client';

import { useEffect, useRef } from 'react';
import { useAudio } from '@/lib/audio-context';
import {
  Spectrum, LoudnessMeter, TestSignal, THIRD_OCTAVE,
  bandCoherence, bandLevelDb, spectralSlopeDbPerOct,
  correlation, peakDb, truePeakDb, rmsDb,
} from '@/lib/dsp';

/**
 * AnalogueStrip — the SHARPpy summary strip, panel for panel, reading the
 * broadcast instead of a sounding.
 *
 * The chrome is a carbon copy: geometry lifted off the source image (1122 x
 * 238) by scanning it for text-cluster bounds, so the panel rules sit at
 * x = 2, 281, 560, 700, 838, the header rule at y = 18, rows land on the
 * original's baselines, and the palette is sampled from its own pixels.
 *
 * What fills it is this station:
 *   parcel indices  -> per-source loudness: LUFS-M/S, LRA, true peak, PLR/PSR
 *   SRH / shear     -> per-octave level, peak, coherence, width
 *   SARS analogues  -> live events against the compliance thresholds
 *   tornado probs   -> the last 70 s of loudness, true peak and correlation
 *
 * Every number comes from lib/dsp.ts (BS.1770-4 loudness, oversampled true
 * peak, real cross-spectrum coherence), measured off the live stream — or off
 * an internally generated sweep + pink noise when the carrier is down.
 */

const W = 1122, H = 238;

const P1 = { x: 2, w: 279 };
const P2 = { x: 281, w: 279 };
const P3 = { x: 560, w: 278, split: 700 };
const P4 = { x: 838, w: 282 };

// Printed on the site's own white rather than the original's black: the ink
// inverts to near-black and every accent is darkened until it carries the
// same weight on paper that the bright version carried on screen.
let BG = '#ffffff';
const BORDER = '#3a7f9f';
const TEXT = '#101010';
const DIM = '#6a6a6a';
const CYAN = '#0a6b8c';
const RED = '#c00000';
const GOLD = '#8a6a00';
const GREEN = '#0a7a20';
const MAGENTA = '#a000a0';
const GRIDC = '#a8ccd8';

// The site's own faces: its interface sans for labels, its IBM Plex Mono for
// every figure. Tabular numerals also keep the value columns properly ranged.
const LABEL_FONT = "Geneva, Tahoma, 'MS Sans Serif', Verdana, sans-serif";
let NUM_FONT = "'IBM Plex Mono', Consolas, monospace";
const FONT = LABEL_FONT;
const FFT_SIZE = 8192;
// One window of L/R pairs, nothing older: the figure has to answer the
// audio immediately, so there is no persistence to drag the shape behind it.
const LISS = 1100;          // sample pairs plotted, newest window only
const LISS_SPAN = 2048;     // samples back from the head (~43 ms at 48k)
const HOLD_DECAY = 12;      // dB per second
const BTN_PX = 10;          // transport button type size
const GRADIENT = true;      // whisper of a wash behind the strip
const GRADIENT_FOOT = '#f1f1ef';   // the bottom of that wash

type Align = 'left' | 'right' | 'center';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '--.-');
const f0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : '--');
const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '-.--');

const GROUPS: [string, number, number][] = [
  ['20-80Hz', 20, 80],
  ['80-320Hz', 80, 320],
  ['320-1k2', 320, 1250],
  ['1k2-5k', 1250, 5000],
  ['5k-20k', 5000, 20000],
];

type Metrics = {
  live: boolean; sr: number;
  mom: number; short: number; integ: number; lra: number;
  tpL: number; tpR: number; pkL: number; pkR: number; rms: number;
  corr: number; plr: number; psr: number; crest: number;
  centroid: number; slope: number; overs: number; silence: boolean;
  gLevel: number[]; gPeak: number[]; gCoh: number[];
  lx: Float32Array; ly: Float32Array; lHead: number;
  since: number;
};

export function AnalogueStrip() {
  const { analyserL, analyserR, isPlaying, broadcastPlay, pause } = useAudio();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiL = useRef<AnalyserNode | null>(null);
  const hiR = useRef<AnalyserNode | null>(null);
  const playing = useRef(false);

  // Higher-resolution tap: the shared analysers are 2048-point, too coarse to
  // resolve a 20 Hz band. An AnalyserNode passes audio through, so this reads
  // the same signal without re-tuning nodes other components depend on.
  useEffect(() => {
    if (!analyserL || !analyserR) { hiL.current = null; hiR.current = null; return; }
    const tap = (src: AnalyserNode) => {
      const a = src.context.createAnalyser();
      a.fftSize = FFT_SIZE; a.smoothingTimeConstant = 0;
      src.connect(a);
      return a;
    };
    const l = tap(analyserL), r = tap(analyserR);
    hiL.current = l; hiR.current = r;
    return () => {
      try { analyserL.disconnect(l); analyserR.disconnect(r); } catch { /* context torn down */ }
      hiL.current = null; hiR.current = null;
    };
  }, [analyserL, analyserR]);

  useEffect(() => { playing.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    const el = canvasRef.current, wrap = wrapRef.current;
    if (!el || !wrap) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    // the strip should sit on exactly the page's white, not a guess at it
    const root = getComputedStyle(document.documentElement);
    const themed = root.getPropertyValue('--vlg-bg').trim();
    if (themed) BG = themed;
    const plex = root.getPropertyValue('--font-ibm-plex-mono').trim();
    if (plex) NUM_FONT = `${plex}, Consolas, monospace`;

    let sr = 48000;
    const spec = new Spectrum(FFT_SIZE);
    const bufL = new Float32Array(FFT_SIZE), bufR = new Float32Array(FFT_SIZE);
    const reL = new Float32Array(FFT_SIZE), imL = new Float32Array(FFT_SIZE);
    const reR = new Float32Array(FFT_SIZE), imR = new Float32Array(FFT_SIZE);
    const NB = THIRD_OCTAVE.length;
    const bandDb = new Float32Array(NB).fill(-120);
    const bandPk = new Float32Array(NB).fill(-120);
    const bandCoh = new Float32Array(NB);
    let loud = new LoudnessMeter(sr);
    let test = new TestSignal(sr);
    let wasLive = false;
    let started = performance.now() / 1000;

    const m: Metrics = {
      live: false, sr,
      mom: -Infinity, short: -Infinity, integ: -Infinity, lra: 0,
      tpL: -Infinity, tpR: -Infinity, pkL: -Infinity, pkR: -Infinity, rms: -Infinity,
      corr: 1, plr: 0, psr: 0, crest: 0, centroid: 0, slope: 0, overs: 0, silence: true,
      gLevel: [0, 0, 0, 0, 0], gPeak: [0, 0, 0, 0, 0], gCoh: [0, 0, 0, 0, 0],
      since: 0,
      lx: new Float32Array(LISS), ly: new Float32Array(LISS), lHead: 0,
    };

    let raf = 0, prev = performance.now() / 1000, lastDraw = 0;

    const tick = () => {
      const now = performance.now() / 1000;
      const dt = clamp(now - prev, 0, 0.25);
      prev = now;

      const live = !!(playing.current && hiL.current && hiR.current);
      if (live && hiL.current) sr = hiL.current.context.sampleRate;
      if (live !== wasLive) {
        loud = new LoudnessMeter(sr); test = new TestSignal(sr);
        m.overs = 0;
        started = now; wasLive = live;
      }
      m.live = live; m.sr = sr; m.since = now - started;

      if (live && hiL.current && hiR.current) {
        hiL.current.getFloatTimeDomainData(bufL);
        hiR.current.getFloatTimeDomainData(bufR);
      } else {
        test.render(bufL, bufR);
      }

      // Loudness integrates at wall-clock rate: an analyser hands back an
      // overlapping window every frame, so only the genuinely new tail counts.
      const fresh = clamp(Math.round(dt * sr), 0, FFT_SIZE);
      if (fresh > 0) loud.push(bufL.subarray(FFT_SIZE - fresh), bufR.subarray(FFT_SIZE - fresh), fresh);

      spec.computeComplex(bufL, reL, imL);
      spec.computeComplex(bufR, reR, imR);

      const decay = HOLD_DECAY * dt;
      const a = 1 - Math.exp(-dt / 0.15);
      const edge = Math.pow(2, 1 / 6);
      for (let b = 0; b < NB; b++) {
        const fc = THIRD_OCTAVE[b];
        bandDb[b] += (bandLevelDb(reL, imL, fc, sr, FFT_SIZE) - bandDb[b]) * a;
        bandPk[b] = Math.max(bandPk[b] - decay, bandDb[b]);
        const lo = Math.max(1, Math.floor(((fc / edge) / sr) * FFT_SIZE));
        const hi = Math.min((FFT_SIZE >> 1) - 1, Math.ceil(((fc * edge) / sr) * FFT_SIZE));
        bandCoh[b] = hi >= lo ? bandCoherence(reL, imL, reR, imR, lo, hi) : 0;
      }

      GROUPS.forEach(([, lo, hi], gi) => {
        let p = 0, pk = 0, coh = 0, n = 0;
        THIRD_OCTAVE.forEach((fc, b) => {
          if (fc < lo || fc >= hi) return;
          p += Math.pow(10, bandDb[b] / 10);
          pk += Math.pow(10, bandPk[b] / 10);
          coh += bandCoh[b]; n++;
        });
        m.gLevel[gi] = p > 0 ? 10 * Math.log10(p) : -120;
        m.gPeak[gi] = pk > 0 ? 10 * Math.log10(pk) : -120;
        m.gCoh[gi] = n ? coh / n : 0;
      });

      // Lissajous: the tail of the current window, rewritten from scratch each
      // frame. x = right, y = left, as the plot is drawn.
      const lstep = Math.max(1, Math.floor(LISS_SPAN / LISS));
      let lp = 0;
      for (let i = FFT_SIZE - LISS_SPAN; i < FFT_SIZE && lp < LISS; i += lstep, lp++) {
        m.lx[lp] = bufR[i];
        m.ly[lp] = bufL[i];
      }
      m.lHead = lp;

      m.pkL = peakDb(bufL); m.pkR = peakDb(bufR);
      m.tpL = truePeakDb(bufL); m.tpR = truePeakDb(bufR);
      m.rms = rmsDb(bufL, bufR);
      m.corr = correlation(bufL, bufR);
      m.mom = loud.momentary(); m.short = loud.shortTerm();
      m.integ = loud.integrated(); m.lra = loud.range();
      const tp = Math.max(m.tpL, m.tpR);
      m.plr = Number.isFinite(m.integ) ? tp - m.integ : 0;
      m.psr = Number.isFinite(m.short) ? tp - m.short : 0;
      m.crest = Number.isFinite(m.rms) ? tp - m.rms : 0;
      m.silence = m.rms < -70;
      if (tp > -0.1) m.overs++;
      let num = 0, den = 0;
      THIRD_OCTAVE.forEach((fc, b) => { const p = Math.pow(10, bandDb[b] / 10); num += p * fc; den += p; });
      m.centroid = den > 0 ? num / den : 0;
      m.slope = spectralSlopeDbPerOct(Array.from(bandDb), THIRD_OCTAVE);

      // the figure has to move with the audio, so this runs every frame
      if (now - lastDraw >= 1 / 60) {
        lastDraw = now;
        const cssW = wrap.clientWidth || W;
        const s = (cssW / W) * (window.devicePixelRatio || 1);
        if (el.width !== Math.round(W * s)) {
          el.width = Math.round(W * s); el.height = Math.round(H * s);
          el.style.height = `${(H * cssW) / W}px`;
        }
        ctx.setTransform(s, 0, 0, s, 0, 0);
        draw(ctx, s, m);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrapRef} style={{ width: 'min(1122px, 98vw)', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', background: BG }} />
      <button
        type="button"
        onClick={() => (isPlaying ? pause() : broadcastPlay())}
        aria-label={isPlaying ? 'Stop broadcast' : 'Play broadcast'}
        style={{
          position: 'absolute', left: '0.55%', top: '1.5%',
          font: `${BTN_PX}px ${LABEL_FONT}`, color: isPlaying ? RED : TEXT,
          background: 'transparent', border: `1px solid ${BORDER}`,
          padding: 0, lineHeight: 1, whiteSpace: 'nowrap',
          width: '2.1%', aspectRatio: '1.35', textAlign: 'center', cursor: 'pointer',
        }}
      >
        {isPlaying ? '■' : '▶'}
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function draw(ctx: CanvasRenderingContext2D, s: number, m: Metrics) {
  const hair = 1 / s;
  const snap = (v: number) => (Math.round(v * s) + 0.5) / s;

  if (GRADIENT) {
    // 2% of luminance across the full height — enough to seat the panel on
    // the page, not enough to read as chrome.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, BG);
    g.addColorStop(1, GRADIENT_FOOT);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = BG;
  }
  ctx.fillRect(0, 0, W, H);

  const text = (str: string, x: number, y: number, color = TEXT, align: Align = 'left', size = 12.5, bold = false, mono = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${size * (mono ? 0.94 : 1)}px ${mono ? NUM_FONT : LABEL_FONT}`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  };
  const vline = (x: number, y0: number, y1: number, color = BORDER) => {
    ctx.strokeStyle = color; ctx.lineWidth = hair;
    ctx.beginPath(); ctx.moveTo(snap(x), y0); ctx.lineTo(snap(x), y1); ctx.stroke();
  };
  const hline = (x0: number, x1: number, y: number, color = BORDER) => {
    ctx.strokeStyle = color; ctx.lineWidth = hair;
    ctx.beginPath(); ctx.moveTo(x0, snap(y)); ctx.lineTo(x1, snap(y)); ctx.stroke();
  };
  const frame = (x: number, y: number, w: number, h: number, color = BORDER) => {
    ctx.strokeStyle = color; ctx.lineWidth = hair;
    ctx.strokeRect(snap(x), snap(y), w, h);
  };
  const inPanel = (x: number, w: number, fn: () => void) => {
    ctx.save(); ctx.beginPath(); ctx.rect(x + 1, 2, w - 2, H - 4); ctx.clip(); fn(); ctx.restore();
  };

  frame(1, 1, W - 3, H - 3);
  for (const x of [P2.x, P3.x, P4.x]) vline(x, 1, H - 2);

  // ── panel 1: the parcel table -> loudness by source ──────────────────────
  inPanel(P1.x, P1.w, () => {
    // column 0's header is the transport button's seat, so it stays empty
    const hdr: [string, number][] = [['LU-M', 88], ['LU-S', 126], ['LRA', 158], ['TP', 196], ['PLR', 234], ['PSR', 272]];
    hdr.forEach(([t, x]) => text(t, x, 16, TEXT, 'right'));
    hline(3, P1.x + P1.w - 2, 20);

    const tp = Math.max(m.tpL, m.tpR);
    const rows: [string, number, number, number, number, number, number][] = [
      ['PGM', m.mom, m.short, m.lra, tp, m.plr, m.psr],
      ['L', m.mom, m.short, m.lra, m.tpL, m.plr, m.psr],
      ['R', m.mom, m.short, m.lra, m.tpR, m.plr, m.psr],
      ['INT', m.integ, m.integ, m.lra, tp, m.plr, m.psr],
    ];
    rows.forEach((r, i) => {
      const y = 36 + i * 13.3;
      const hot = i === 3;
      const over = Number.isFinite(r[4]) && r[4] > -1;
      text(r[0], 50, y, hot ? CYAN : TEXT, 'right');
      text(f1(r[1]), 88, y, hot ? GOLD : TEXT, 'right', 12.5, false, true);
      text(f1(r[2]), 126, y, hot ? GREEN : TEXT, 'right', 12.5, false, true);
      text(f1(r[3]), 158, y, TEXT, 'right', 12.5, false, true);
      text(f1(r[4]), 196, y, over ? RED : TEXT, 'right', 12.5, false, true);
      text(f1(r[5]), 234, y, TEXT, 'right', 12.5, false, true);
      text(f1(r[6]), 272, y, TEXT, 'right', 12.5, false, true);
    });
    frame(5, 66, P1.w - 10, 14, '#707070');
    hline(3, P1.x + P1.w - 2, 84);

    const block: [string, string, string][] = [
      [`PK = ${f1(Math.max(m.pkL, m.pkR))}`, `r = ${f2(m.corr)}`, `CF = ${f1(m.crest)}`],
      [`RMS = ${f1(m.rms)}`, `W = ${f0((1 - m.corr) * 50)}%`, `SL = ${f1(m.slope)}`],
      [`TPL = ${f1(m.tpL)}`, `CEN = ${m.centroid >= 1000 ? `${(m.centroid / 1000).toFixed(1)}k` : f0(m.centroid)}`, `OVR = ${m.overs}`],
      [`TPR = ${f1(m.tpR)}`, `SR = ${(m.sr / 1000).toFixed(1)}k`, `SIL = ${m.silence ? 'Y' : 'n'}`],
      [`LRA = ${f1(m.lra)}`, `FFT = ${FFT_SIZE}`, `PLR = ${f1(m.plr)}`],
      [`UP = ${f0(m.since)}s`, `BIN = ${(m.sr / FFT_SIZE).toFixed(1)}`, m.live ? 'ON AIR' : 'TEST'],
    ];
    block.forEach((r, i) => {
      const y = 99 + i * 13.2;
      text(r[0], 9, y, TEXT, 'left', 12.5, false, true);
      text(r[1], 100, y, TEXT, 'left', 12.5, false, true);
      text(r[2], 186, y, TEXT, 'left', 12.5, false, true);
    });
    hline(3, P1.x + P1.w - 2, 183);

    frame(4, 184, 190, H - 187, BORDER);
    frame(196, 184, P1.w - 200, H - 187, BORDER);
    GROUPS.slice(0, 4).forEach(([name], i) =>
      text(`${name} = ${f1(m.gLevel[i])} dBFS`, 8, 194 + i * 12.2, TEXT, 'left', 12.5, false, true));
    const right: [string, string][] = [
      [`HDRM ${f1(-1 - tp)}`, TEXT],
      [`TGT ${Number.isFinite(m.integ) ? f1(m.integ + 14) : '--.-'}`, GOLD],
      [`OVR ${m.overs}`, m.overs ? RED : GOLD],
      [`${m.live ? (tp > -1 ? 'HOT' : 'ON AIR') : 'TEST'}`, m.live && tp > -1 ? RED : TEXT],
    ];
    right.forEach(([l, c], i) => text(l, 200, 194 + i * 12.2, c, 'left', 11, true, true));
  });

  // ── panel 2: kinematics -> the band table ────────────────────────────────
  inPanel(P2.x, P2.w, () => {
    text('LEVEL (dBFS)', 408, 16, TEXT, 'right');
    text('PEAK', 467, 16, TEXT, 'right');
    text('COH', 518, 16, TEXT, 'right');
    text('WIDTH', 558, 16, TEXT, 'right');
    hline(P2.x + 2, P2.x + P2.w - 2, 20);

    GROUPS.forEach(([name], i) => {
      const y = 36 + i * 13.3;
      const coh = m.gCoh[i];
      text(name, 289, y);
      text(f1(m.gLevel[i]), 391, y, m.gLevel[i] > -6 ? RED : TEXT, 'right', 12.5, false, true);
      text(f1(m.gPeak[i]), 448, y, TEXT, 'right', 12.5, false, true);
      text(f2(coh), 496, y, coh < 0 ? RED : TEXT, 'right', 12.5, false, true);
      text(`${f0((1 - coh) * 50)}%`, 555, y, TEXT, 'right', 12.5, false, true);
    });

    const y6 = 36 + 5 * 13.3;
    text('Full band', 289, y6);
    text(f1(m.rms), 391, y6, TEXT, 'right', 12.5, false, true);
    text(f1(Math.max(m.pkL, m.pkR)), 448, y6, TEXT, 'right', 12.5, false, true);
    text(f2(m.corr), 496, y6, m.corr < 0 ? RED : TEXT, 'right', 12.5, false, true);
    text(`${f0((1 - m.corr) * 50)}%`, 555, y6, TEXT, 'right', 12.5, false, true);

    text('Crest factor =', 289, 150);
    text(`${f1(m.crest)} dB`, 397, 150, TEXT, 'left', 12.5, false, true);
    text('Centroid =', 289, 163);
    text(m.centroid >= 1000 ? `${(m.centroid / 1000).toFixed(2)} kHz` : `${f0(m.centroid)} Hz`, 397, 163);

    text('...Stereo Motion Vectors...', 289, 182);
    const mid = m.rms + 20 * Math.log10(Math.max(0.05, (1 + m.corr) / 2));
    const side = m.rms + 20 * Math.log10(Math.max(0.05, (1 - m.corr) / 2));
    text('Mid level =', 289, 195);
    text(`${f1(mid)} dB`, 397, 195, CYAN, 'left', 12.5, false, true);
    text('Side level =', 289, 208);
    text(`${f1(side)} dB`, 397, 208, RED, 'left', 12.5, false, true);
    text('Phase angle =', 289, 221);
    text(`${f0(Math.acos(clamp(m.corr, -1, 1)) * 57.2958)} deg`, 421, 221, TEXT, 'left', 12.5, false, true);
    text('Spectral slope =', 289, 234);
    text(`${f1(m.slope)} dB/oct`, 421, 234, TEXT, 'left', 12.5, false, true);

    // correlation needle, where the wind barbs sat
    ctx.strokeStyle = m.corr < 0 ? RED : CYAN; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(508, 176); ctx.lineTo(508 + 22 * clamp(m.corr, -1, 1), 156); ctx.stroke();
    ctx.strokeStyle = DIM; ctx.lineWidth = hair;
    ctx.beginPath(); ctx.moveTo(486, 176); ctx.lineTo(530, 176); ctx.stroke();
    text('correlation', 484, 192, CYAN, 'left', 11);
    text(`r = ${f2(m.corr)}`, 496, 205, CYAN, 'left', 11);
  });

  // ── panel 3: SARS -> live events against thresholds ─────────────────────
  inPanel(P3.x, P3.w, () => {
    text('MATCH - Signal Analogue System', P3.x + P3.w / 2, 15, TEXT, 'center', 13);
    hline(P3.x + 2, P3.x + P3.w - 2, 20);
    frame(P3.x + 4, 22, P3.split - P3.x - 8, H - 26);
    frame(P3.split + 2, 22, P3.x + P3.w - P3.split - 6, H - 26);

    const lc = (P3.x + P3.split) / 2;
    const rc = (P3.split + P3.x + P3.w) / 2;
    text('BROADCAST', lc, 37, TEXT, 'center', 13);
    text('THRESHOLD', rc, 37, TEXT, 'center', 13);

    const stamp = new Date().toISOString().slice(11, 19);
    const tp = Math.max(m.tpL, m.tpR);
    const events: [string, string][] = [
      [`${stamp} CARRIER ${m.live ? 'UP' : 'DN'}`, m.live ? CYAN : RED],
      [`${stamp} TP ${f1(tp)}dBTP`, tp > -1 ? RED : CYAN],
      [`${stamp} LUFS-S ${f1(m.short)}`, CYAN],
      [`${stamp} r ${f2(m.corr)} ${m.corr < 0 ? 'OUT' : 'OK'}`, m.corr < 0 ? RED : CYAN],
      [`${stamp} LRA ${f1(m.lra)} LU`, m.lra < 3 ? RED : CYAN],
    ];
    events.forEach(([l, c], i) => text(l, P3.x + 7, 52 + i * 13, c, 'left', 10.5, false, true));

    const checks: [string, boolean][] = [
      ['-1.0 dBTP ceiling', tp <= -1],
      ['-14 LUFS target', Number.isFinite(m.integ) && Math.abs(m.integ + 14) <= 2],
      ['LRA > 3 LU', m.lra > 3],
      ['r > 0', m.corr > 0],
      ['no silence', !m.silence],
    ];
    checks.forEach(([l, ok], i) =>
      text(`${ok ? 'PASS' : 'FAIL'}  ${l}`, P3.split + 5, 52 + i * 13, ok ? CYAN : RED, 'left', 11));

    const passed = checks.filter(c => c[1]).length;
    text(`(${m.overs} true-peak overs)`, lc, 220, MAGENTA, 'center', 11);
    text(`MATCH: ${f0(clamp(m.corr, 0, 1) * 100)}% MONO`, lc, 233, MAGENTA, 'center', 11);
    text(`(${passed} of ${checks.length} passing)`, rc, 220, MAGENTA, 'center', 11);
    text(`COMPLIANCE: ${Math.round((passed / checks.length) * 100)}%`, rc, 233, MAGENTA, 'center', 11);
  });

  // ── panel 4: the stereo field as a Lissajous dot cloud ──────────────────
  // x = right channel, y = left channel, both -1..1. The dashed diagonals are
  // the correlation axes: y (+45) is mono, q (-45) is out of phase.
  inPanel(P4.x, P4.w, () => {
    text('Lissajous - stereo field', P4.x + P4.w / 2, 13, TEXT, 'center', 12);

    const size = 186;
    const cx = P4.x + P4.w / 2 + 6;
    const cy = 20 + size / 2;
    const R = size / 2;
    const toX = (v: number) => cx + clamp(v, -1, 1) * R;
    const toY = (v: number) => cy - clamp(v, -1, 1) * R;

    frame(cx - R, cy - R, size, size, DIM);
    hline(cx - R, cx + R, cy, DIM);          // x_R = 0
    vline(cx, cy - R, cy + R, DIM);          // x_L = 0

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = DIM; ctx.lineWidth = hair;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy + R); ctx.lineTo(cx + R, cy - R);   // y: in phase
    ctx.moveTo(cx - R, cy - R); ctx.lineTo(cx + R, cy + R);   // q: anti phase
    ctx.stroke();
    ctx.setLineDash([]);
    text('y', cx + R - 11, cy - R + 12, TEXT, 'left', 10);
    text('q', cx - R + 4, cy - R + 12, TEXT, 'left', 10);

    for (const v of [-1, -0.5, 0.5, 1]) {
      const x = toX(v), y = toY(v);
      vline(x, cy - 3, cy + 3, DIM);
      hline(cx - 3, cx + 3, y, DIM);
    }
    text('-1', toX(-1), cy + R + 12, TEXT, 'center', 9, false, true);
    text('0', cx, cy + R + 12, TEXT, 'center', 9, false, true);
    text('+1', toX(1), cy + R + 12, TEXT, 'center', 9, false, true);
    text('xR', cx + R + 4, cy + 4, TEXT, 'left', 9);
    text('xL', cx - 5, cy - R + 12, TEXT, 'right', 9);

    // the cloud itself — one window, every dot equal, no trailing
    ctx.fillStyle = TEXT;
    ctx.globalAlpha = 0.72;
    for (let k = 0; k < m.lHead; k++) {
      ctx.fillRect(toX(m.lx[k]) - 0.65, toY(m.ly[k]) - 0.65, 1.3, 1.3);
    }
    ctx.globalAlpha = 1;

    text(`r = ${f2(m.corr)}`, P4.x + 8, H - 8, TEXT, 'left', 10, false, true);
    text(`width ${f0((1 - m.corr) * 50)}%`, P4.x + P4.w - 8, H - 8, TEXT, 'right', 10, false, true);
  });

}
