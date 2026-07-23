'use client';

import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { BroadcastLiveTag } from '@/components/BroadcastLiveTag';
import { LcdPanel } from '@/components/LcdPanel';
import { ShannonDiagram } from '@/components/ShannonDiagram';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

/**
 * HtopBroadcast — the broadcast as a monochrome `htop` monitor. A dot-matrix
 * LED strip up top traces the live waveform; the six meters visualise the
 * signal (bars 1–4 = four frequency bands sub/low/mid/high from the live FFT,
 * `Lvl` overall level, `Pk` peak dB); the telemetry block is live broadcast
 * status (source, signal tag, rolling level average, on-air uptime, SNR,
 * transport); the process table treats each frequency bin as a process, sorted
 * by energy so the rows constantly reorder and "flow" like htop.
 *
 * `mobile` renders a compact stacked variant for the phone layout — smaller
 * type, narrower bars, a trimmed table and telemetry — reusing all the same
 * audio logic. Hot values are written straight to `textContent` in a rAF loop
 * so nothing re-renders React. Idle = a low shimmer so nothing goes dead.
 */

const BANDS: [number, number, string][] = [
  [20, 160, 'sub'],
  [160, 800, 'low'],
  [800, 4000, 'mid'],
  [4000, 16000, 'hi'],
];
const F_LO = 35, F_HI = 16000;   // table bin range, Hz
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

// LED segment meter — solid ink cells that light up over an empty-square track.
function applyLed(el: HTMLSpanElement, on: boolean): void {
  el.style.background = on ? 'var(--vlg-strong, #000)' : 'transparent';
}
const METER_LABELS = ['1', '2', '3', '4', 'Lvl', 'Pk'];
const BAR_SEG = 20;   // fixed LED segments per process-table row (constant width → no reflow)

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
const TABLE_HEADER_M =
  ['BAND'.padEnd(3), 'FREQ'.padStart(5), 'ENR'.padStart(4), 'S', 'SIGNAL'].join(' ');

// Passive status/config footer — informational, not interactive (no fake keys).
const STATUS =
  'sort: energy  ·  log bins 35–16khz  ·  blackman  ·  peak-hold on';

export function HtopBroadcast({ mobile = false }: { mobile?: boolean } = {}) {
  const { analyserFreq, isPlaying, mode, carrierLost, currentTrack, broadcastPlay, pause } = useAudio();
  const isBroadcasting = mode === 'broadcast' && isPlaying;

  const rowCount = mobile ? 7 : 13;
  const meterW = mobile ? 16 : 28;

  const aFRef = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  useEffect(() => { aFRef.current = analyserFreq; }, [analyserFreq]);
  useEffect(() => {
    liveRef.current = isPlaying && mode === 'broadcast' && !carrierLost;
  }, [isPlaying, mode, carrierLost]);
  const trackRef = useRef('village radio');
  useEffect(() => { trackRef.current = currentTrack?.title ?? 'village radio'; }, [currentTrack]);

  const cellRefs = useRef<(HTMLSpanElement | null)[][]>([]);
  const readoutRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rowTextRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rowCellRefs = useRef<(HTMLSpanElement | null)[][]>([]);
  const srcRef = useRef<HTMLSpanElement>(null);
  const loadRef = useRef<HTMLSpanElement>(null);
  const upRef = useRef<HTMLSpanElement>(null);
  const snrRef = useRef<HTMLSpanElement>(null);

  // per-bin persistent state for the process table
  const bins = useMemo(() => Array.from({ length: rowCount }, (_, i) => {
    const cf = F_LO * Math.pow(F_HI / F_LO, (i + 0.5) / rowCount);
    const band = BANDS.find(([lo, hi]) => cf >= lo && cf < hi)?.[2]
      ?? (cf < 20 ? 'sub' : 'hi');
    return {
      pid: 120 + ((i * 2654435761) >>> 0) % 89000,
      band, cf, peak: 0, holdStart: performance.now(),
    };
  }), [rowCount]);

  const freqBuf = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(1024));
  const rowBuf = useRef<Float32Array<ArrayBuffer>>(new Float32Array(rowCount));
  const load = useRef<[number, number, number]>([0, 0, 0]);
  const rafRef = useRef(0);
  const frameRef = useRef(0);

  const tick = useCallback(() => {
    const now = performance.now();
    const t = now * 0.001;
    const live = liveRef.current;
    const aF = aFRef.current;
    if (rowBuf.current.length !== rowCount) rowBuf.current = new Float32Array(rowCount);

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
      for (let i = 0; i < rowCount; i++) {
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
    {
      const g = METER_GAIN;
      const pkDb = peak > 1e-4 ? (20 * Math.log10(peak)).toFixed(1) : '-inf';
      const vals = [band[0] * g, band[1] * g, band[2] * g, band[3] * g, level * g, peak * g];
      const outs = [
        `${(band[0] * g * 100).toFixed(1)}%`,
        `${(band[1] * g * 100).toFixed(1)}%`,
        `${(band[2] * g * 100).toFixed(1)}%`,
        `${(band[3] * g * 100).toFixed(1)}%`,
        `${(level * g * 100).toFixed(1)}%`,
        `${pkDb}dB`,
      ];
      for (let i = 0; i < METER_LABELS.length; i++) {
        // only light up when the broadcast is actually playing — idle = all off
        const f = live ? Math.max(0, Math.min(meterW, Math.round(vals[i] * meterW))) : 0;
        const cells = cellRefs.current[i];
        if (cells) {
          for (let j = 0; j < meterW; j++) {
            const el = cells[j];
            if (!el) continue;
            applyLed(el, j < f);
          }
        }
        const ro = readoutRefs.current[i];
        if (ro) ro.textContent = live ? outs[i] : (i === 5 ? '-inf dB' : '0.0%');
      }
    }

    // ── process table (throttled for the htop "flow") ──────────────────────
    if (frameRef.current % 6 === 0) {
      const rows = bins.map((bn, i) => {
        const enr = rowBuf.current[i];
        if (enr >= bn.peak) { bn.peak = enr; bn.holdStart = now; }
        else bn.peak *= 0.992;
        const state = enr > 0.5 ? 'R' : enr > 0.22 ? 'D' : 'S';
        // SIGNAL is now an LED segment bar (fixed width); idle = unlit
        const barN = live ? Math.min(BAR_SEG, Math.round(enr * 20)) : 0;
        const text = mobile
          ? [
            bn.band.padEnd(3),
            fmtFreq(bn.cf).padStart(5),
            (enr * 100).toFixed(0).padStart(4),
            state,
          ].join(' ')
          : [
            String(bn.pid).padStart(5),
            bn.band.padEnd(4),
            fmtFreq(bn.cf).padStart(5),
            (enr > 1e-4 ? (20 * Math.log10(enr)).toFixed(1) : '-99.9').padStart(6),
            state,
            (enr * 100).toFixed(1).padStart(5),
            (bn.peak * 100).toFixed(1).padStart(5),
            fmtHold((now - bn.holdStart) / 1000).padStart(8),
          ].join(' ');
        return { enr, text, barN };
      });
      rows.sort((a, b) => b.enr - a.enr);
      for (let r = 0; r < rows.length; r++) {
        const rt = rowTextRefs.current[r];
        if (rt) rt.textContent = rows[r].text + ' ';
        const cells = rowCellRefs.current[r];
        if (cells) {
          const barN = rows[r].barN;
          for (let j = 0; j < BAR_SEG; j++) {
            const el = cells[j];
            if (!el) continue;
            applyLed(el, j < barN);
          }
        }
      }
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
    }

    frameRef.current++;
    rafRef.current = requestAnimationFrame(tick);
  }, [bins, mobile, rowCount, meterW]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  // Desktop type matches the info page's mono body (11px / 14px)
  const fs = 11;
  const lh = mobile ? 15 : 14;
  const base: React.CSSProperties = {
    fontFamily: MONO, fontSize: fs, lineHeight: `${lh}px`,
    letterSpacing: '0.02em', color: 'var(--vlg-fg, #000)', margin: 0,
  };
  const label = { color: 'var(--vlg-fg, #000)' };
  const dotW = mobile ? 340 : 580;
  const cellPx = 5;
  const cellGap = 3;

  // meters + telemetry row (the "live broadcast" readout — its top edge is the
  // Source/1[ line, its stack bottoms out at the process table / status footer)
  const metersBlock = (
    <div style={{
      display: 'flex', flexDirection: 'row',
      gap: 18, alignItems: 'flex-start',
    }}>
      <div style={{ ...base, display: 'flex', flexDirection: 'column', gap: mobile ? 3 : 4 }}>
        {METER_LABELS.map((lab, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ ...label, width: 24, textAlign: 'right', marginRight: 5 }}>{lab}</span>
            <span>[</span>
            <span style={{ display: 'inline-flex', gap: cellGap, margin: '0 4px' }}>
              {Array.from({ length: meterW }).map((_, j) => (
                <span
                  key={j}
                  ref={el => { (cellRefs.current[i] ??= [])[j] = el; }}
                  style={{
                    width: cellPx, height: cellPx, display: 'inline-block', boxSizing: 'border-box',
                    border: '1px solid var(--vlg-fg, #111)',
                  }}
                />
              ))}
            </span>
            <span>]</span>
            <span
              ref={el => { readoutRefs.current[i] = el; }}
              style={{ ...label, marginLeft: 6, width: mobile ? 48 : 52, overflow: 'hidden', display: 'inline-block' }}
            />
          </div>
        ))}
      </div>

      {/* Fixed-width column: the telemetry text changes on play (track title,
          live tag, SNR…); pinning the width stops those from resizing the
          shrink-wrapped frame and sliding the whole unit. */}
      <div style={{ ...base, whiteSpace: 'pre', width: mobile ? undefined : 190, overflow: 'hidden' }}>
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={label}>Source: </span><span ref={srcRef}>village radio</span>
        </div>
        <div><span style={label}>Signal: </span><BroadcastLiveTag /></div>
        {!mobile && (
          <div><span style={label}>Codec:  </span>pcm 48.0kHz</div>
        )}
        <div><span style={label}>Level avg: </span><span ref={loadRef}>0.00 0.00 0.00</span></div>
        <div><span style={label}>On air: </span><span ref={upRef}>0d 00:00:00</span></div>
        {!mobile && (
          <div><span style={label}>SNR: </span><span ref={snrRef}>-- dB</span></div>
        )}
        <button
          onClick={() => (isBroadcasting ? pause() : broadcastPlay())}
          style={{
            ...base, marginTop: 4, background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', pointerEvents: 'auto', textTransform: 'uppercase',
            color: 'var(--vlg-strong, #000)',
          }}
        >
          {isBroadcasting ? '[ ❚❚ STOP ]' : '[ ▶ PLAY ]'}
        </button>
      </div>
    </div>
  );

  const tableBlock = (
    <div style={{ ...base, marginTop: mobile ? 12 : 14 }}>
      <div style={{ whiteSpace: 'pre', color: 'var(--vlg-fg, #000)' }}>{mobile ? TABLE_HEADER_M : TABLE_HEADER}</div>
      {Array.from({ length: rowCount }).map((_, r) => (
        <div key={r} style={{ display: 'flex', alignItems: 'center' }}>
          <span ref={el => { rowTextRefs.current[r] = el; }} style={{ whiteSpace: 'pre' }} />
          <span style={{ display: 'inline-flex', gap: cellGap, marginLeft: 4 }}>
            {Array.from({ length: BAR_SEG }).map((_, j) => (
              <span
                key={j}
                ref={el => { (rowCellRefs.current[r] ??= [])[j] = el; }}
                style={{
                  width: cellPx, height: cellPx, display: 'inline-block', boxSizing: 'border-box',
                  border: '1px solid var(--vlg-fg, #111)',
                }}
              />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
  const statusBlock = (
    <div style={{ ...base, marginTop: 12, color: 'var(--vlg-fg, #000)', whiteSpace: 'nowrap' }}>{STATUS}</div>
  );

  return (
    <div style={{ position: 'relative', pointerEvents: 'none' }}>
      {/* top visual row. Mobile: LCD strip. Desktop: hex-dump filler on the left,
          LCD as a square on the right, sitting above the Source/telemetry column. */}
      {mobile ? (
        <div style={{ position: 'relative', width: dotW, height: 96, marginBottom: 12 }}>
          <LcdPanel mobile />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: 12, marginBottom: 12, paddingRight: 28 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <ShannonDiagram />
          </div>
          <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
            <LcdPanel />
          </div>
        </div>
      )}
      {metersBlock}
      {tableBlock}
      {!mobile && statusBlock}
    </div>
  );
}
