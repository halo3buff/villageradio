'use client';

import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { BroadcastLiveTag } from '@/components/BroadcastLiveTag';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

/**
 * HtopBroadcast — the broadcast as a monochrome `htop` monitor (reference:
 * a classic htop screen). The six top-left meters visualise the signal:
 * bars 1–4 are four frequency bands (sub / low / mid / high) from the live
 * FFT, `Lvl` is the overall level, `Pk` the peak in dB. The right-hand block
 * is live broadcast telemetry (source, signal tag, rolling level average,
 * on-air uptime, SNR, transport). The process table below treats each
 * frequency bin as a process — sorted by energy so the rows constantly
 * reorder and "flow" like htop, with peak-hold and hold-timers.
 *
 * All text is DOM (text IS the interface); the hot values are written
 * straight to `textContent` in a rAF loop so nothing re-renders React.
 * Idle (not on air) = a low shimmer so the meters and log never go dead.
 */

const BANDS: [number, number, string][] = [
  [20, 160, 'sub'],
  [160, 800, 'low'],
  [800, 4000, 'mid'],
  [4000, 16000, 'hi'],
];
const ROWS = 18;                 // process-table rows (frequency bins)
const F_LO = 35, F_HI = 16000;   // table bin range, Hz
const METER_W = 28;              // inner width of a meter bar
const METER_GAIN = 0.8;          // display headroom so loud bands don't peg 100%
// "On air since" — the project's first commit ("Initial build"), so the uptime
// is the real elapsed time the station has existed. Drives the On-air counter.
const STATION_EPOCH = Date.parse('2026-05-17T00:16:56-04:00');

function bandAvg(buf: Uint8Array, sr: number, lo: number, hi: number): number {
  const nyq = sr / 2, n = buf.length;
  const a = Math.max(0, Math.floor((lo / nyq) * n));
  const b = Math.min(n, Math.max(a + 1, Math.ceil((hi / nyq) * n)));
  let s = 0;
  for (let i = a; i < b; i++) s += buf[i];
  return s / (b - a) / 255;
}

function logBinsInto(buf: Uint8Array, sr: number, out: Float32Array): void {
  const nyq = sr / 2, ratio = F_HI / F_LO, n = out.length;
  for (let i = 0; i < n; i++) {
    const f0 = F_LO * Math.pow(ratio, i / n);
    const f1 = F_LO * Math.pow(ratio, (i + 1) / n);
    const a = Math.max(0, Math.floor((f0 / nyq) * buf.length));
    const b = Math.min(buf.length, Math.max(a + 1, Math.ceil((f1 / nyq) * buf.length)));
    let s = 0;
    for (let j = a; j < b; j++) s += buf[j];
    out[i] = s / (b - a) / 255;
  }
}

function meterLine(label: string, pct: number, readout: string): string {
  const f = Math.max(0, Math.min(METER_W, Math.round(pct * METER_W)));
  let inner = '|'.repeat(f) + ' '.repeat(METER_W - f);
  inner = inner.slice(0, METER_W - readout.length) + readout;
  return label.padStart(3) + '[' + inner + ']';
}

function fmtFreq(f: number): string {
  return f < 1000 ? String(Math.round(f)) : `${(f / 1000).toFixed(1)}k`;
}
function fmtHold(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.min(59.99, sec % 60);
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${d}d ${h}:${m}:${ss}`;
}

const TABLE_HEADER =
  ['PID'.padStart(5), 'BAND'.padEnd(4), 'FREQ'.padStart(5), 'LVLdB'.padStart(6),
    'S', 'ENR%'.padStart(5), 'PK%'.padStart(5), 'HOLD+'.padStart(8), 'SIGNAL'].join(' ');

// Passive status/config footer — informational, not interactive (no fake keys).
const STATUS =
  'sort: energy  ·  18 log bins 35–16khz  ·  blackman  ·  peak-hold on';

export function HtopBroadcast() {
  const { analyserFreq, isPlaying, mode, carrierLost, currentTrack, broadcastPlay, pause } = useAudio();
  const isBroadcasting = mode === 'broadcast' && isPlaying;

  const aFRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aFRef.current = analyserFreq; }, [analyserFreq]);
  useEffect(() => {
    liveRef.current = isPlaying && mode === 'broadcast' && !carrierLost;
  }, [isPlaying, mode, carrierLost]);
  const trackRef = useRef('village radio');
  useEffect(() => { trackRef.current = currentTrack?.title ?? 'village radio'; }, [currentTrack]);

  const metersRef = useRef<HTMLPreElement>(null);
  const tableRef = useRef<HTMLPreElement>(null);
  const srcRef = useRef<HTMLSpanElement>(null);
  const loadRef = useRef<HTMLSpanElement>(null);
  const upRef = useRef<HTMLSpanElement>(null);
  const snrRef = useRef<HTMLSpanElement>(null);
  const fftRef = useRef<HTMLSpanElement>(null);

  // per-bin persistent state for the process table
  const bins = useMemo(() => Array.from({ length: ROWS }, (_, i) => {
    const cf = F_LO * Math.pow(F_HI / F_LO, (i + 0.5) / ROWS);
    const band = BANDS.find(([lo, hi]) => cf >= lo && cf < hi)?.[2]
      ?? (cf < 20 ? 'sub' : 'hi');
    return {
      pid: 120 + ((i * 2654435761) >>> 0) % 89000,
      band, cf, peak: 0, holdStart: performance.now(),
    };
  }), []);

  const freqBuf = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(1024));
  const rowBuf = useRef<Float32Array<ArrayBuffer>>(new Float32Array(ROWS));
  const load = useRef<[number, number, number]>([0, 0, 0]);
  const rafRef = useRef(0);
  const frameRef = useRef(0);

  const tick = useCallback(() => {
    const now = performance.now();
    const t = now * 0.001;
    const live = liveRef.current;
    const aF = aFRef.current;

    // ── read the spectrum (or idle shimmer) ────────────────────────────────
    const band = [0, 0, 0, 0];
    if (live && aF) {
      if (freqBuf.current.length !== aF.frequencyBinCount) {
        freqBuf.current = new Uint8Array(aF.frequencyBinCount);
      }
      aF.getByteFrequencyData(freqBuf.current);
      const sr = aF.context.sampleRate;
      for (let k = 0; k < 4; k++) band[k] = bandAvg(freqBuf.current, sr, BANDS[k][0], BANDS[k][1]);
      logBinsInto(freqBuf.current, sr, rowBuf.current);
    } else {
      for (let k = 0; k < 4; k++) band[k] = 0.03 + 0.03 * Math.abs(Math.sin(t * 0.4 + k * 1.3));
      for (let i = 0; i < ROWS; i++) {
        rowBuf.current[i] = 0.02 + 0.05 * Math.max(0, Math.sin(t * 0.6 + i * 0.7))
          * Math.max(0, Math.sin(t * 0.23 + i));
      }
    }
    const level = (band[0] + band[1] + band[2] + band[3]) / 4;
    const peak = Math.max(band[0], band[1], band[2], band[3]);

    // rolling level average — the "load average" analogue (fast / med / slow)
    const A = [0.30, 0.06, 0.015];
    for (let k = 0; k < 3; k++) load.current[k] += (level - load.current[k]) * A[k];

    // ── meters (every frame). Bars carry display headroom (METER_GAIN) so a
    //    loud band reads high without pegging the bracket; Pk's readout stays
    //    the true dBFS ───────────────────────────────────────────────────────
    if (metersRef.current) {
      const g = METER_GAIN;
      const pkDb = peak > 1e-4 ? (20 * Math.log10(peak)).toFixed(1) : '-inf';
      metersRef.current.textContent = [
        meterLine('1', band[0] * g, `${(band[0] * g * 100).toFixed(1)}%`),
        meterLine('2', band[1] * g, `${(band[1] * g * 100).toFixed(1)}%`),
        meterLine('3', band[2] * g, `${(band[2] * g * 100).toFixed(1)}%`),
        meterLine('4', band[3] * g, `${(band[3] * g * 100).toFixed(1)}%`),
        meterLine('Lvl', level * g, `${(level * g * 100).toFixed(1)}%`),
        meterLine('Pk', peak * g, `${pkDb}dB`),
      ].join('\n');
    }

    // ── process table (throttled for the htop "flow") ──────────────────────
    if (frameRef.current % 6 === 0 && tableRef.current) {
      const rows = bins.map((bn, i) => {
        const enr = rowBuf.current[i];
        if (enr >= bn.peak) { bn.peak = enr; bn.holdStart = now; }
        else bn.peak *= 0.992;
        const lvlDb = enr > 1e-4 ? (20 * Math.log10(enr)).toFixed(1) : '-99.9';
        const state = enr > 0.5 ? 'R' : enr > 0.22 ? 'D' : 'S';
        const barN = Math.round(enr * 20);
        return {
          enr,
          text: [
            String(bn.pid).padStart(5),
            bn.band.padEnd(4),
            fmtFreq(bn.cf).padStart(5),
            lvlDb.padStart(6),
            state,
            (enr * 100).toFixed(1).padStart(5),
            (bn.peak * 100).toFixed(1).padStart(5),
            fmtHold((now - bn.holdStart) / 1000).padStart(8),
            '|'.repeat(barN),
          ].join(' '),
        };
      });
      rows.sort((a, b) => b.enr - a.enr);
      tableRef.current.textContent = TABLE_HEADER + '\n' + rows.map(r => r.text).join('\n');
    }

    // ── telemetry block (throttled) ────────────────────────────────────────
    if (frameRef.current % 15 === 0) {
      if (srcRef.current) srcRef.current.textContent = trackRef.current;
      if (loadRef.current) {
        loadRef.current.textContent = load.current.map(v => v.toFixed(2)).join(' ');
      }
      if (upRef.current) upRef.current.textContent = fmtUptime(Date.now() - STATION_EPOCH);
      if (snrRef.current) {
        snrRef.current.textContent = live ? `${(40 + level * 30).toFixed(1)} dB` : '-- dB';
      }
      if (fftRef.current) {
        fftRef.current.textContent = aF ? `${aF.fftSize}pt` : '4096pt';
      }
    }

    frameRef.current++;
    rafRef.current = requestAnimationFrame(tick);
  }, [bins]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  const base: React.CSSProperties = {
    fontFamily: MONO, fontSize: 14, lineHeight: '19px',
    letterSpacing: '0.02em', color: 'var(--vlg-fg, #000)', margin: 0,
  };
  const label = { color: 'var(--vlg-fg-dim, #555)' };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* top row: meters (left) + telemetry (right) */}
      <div style={{ display: 'flex', gap: 44, alignItems: 'flex-start' }}>
        <pre ref={metersRef} style={base} />

        <div style={{ ...base, whiteSpace: 'pre', lineHeight: '16px' }}>
          <div><span style={label}>Source: </span><span ref={srcRef}>village radio</span></div>
          <div><span style={label}>Signal: </span><BroadcastLiveTag /></div>
          <div><span style={label}>Codec:  </span>pcm 48.0kHz · fft <span ref={fftRef}>4096pt</span></div>
          <div><span style={label}>Level avg: </span><span ref={loadRef}>0.00 0.00 0.00</span></div>
          <div><span style={label}>On air: </span><span ref={upRef}>0d 00:00:00</span></div>
          <div><span style={label}>SNR: </span><span ref={snrRef}>-- dB</span></div>
          <button
            onClick={() => (isBroadcasting ? pause() : broadcastPlay())}
            style={{
              ...base, marginTop: 4, background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', pointerEvents: 'auto', textTransform: 'uppercase',
              color: 'var(--vlg-strong, #000)',
            }}
          >
            {isBroadcasting ? '[ ❚❚ PAUSE ]' : '[ ▶ PLAY ]'}
          </button>
        </div>
      </div>

      {/* the flowing process table */}
      <pre ref={tableRef} style={{ ...base, marginTop: 18 }} />

      {/* passive status/config footer (informational, not interactive) */}
      <div style={{ ...base, marginTop: 16, color: 'var(--vlg-fg-dim, #555)', whiteSpace: 'nowrap' }}>{STATUS}</div>
    </div>
  );
}
