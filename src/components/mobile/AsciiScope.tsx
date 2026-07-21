'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { useSignalNet } from '@/components/mobile/MobileScope';
import { AsciiGrid, RAMP, box, text, CELL_ASPECT, type Grid } from '@/components/instruments/AsciiGrid';

const SAMPLES = 2000;
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

// Box-drawing frame — fills the full cell and tiles with the edges, so every
// corner closes (plain '-'/'+' leaves a gap above the top edge).
const FRAME = { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘' };

// Phosphor persistence: each frame the accumulator decays toward zero so the
// trace leaves a fading comet-tail. Higher = longer glow.
const DECAY = 0.86;

// The trace maps into the UPPER RAMP band so even its faintest decaying tail
// reads heavier than the '·' dot field. RAMP = ' .·:-=+*#%@' → index 4 = '-'.
const FIELD = '·';
const TRACE_LO = 4;

/**
 * ASCII vectorscope — an X-Y phase display in the register of an old DSP CRT,
 * drawn entirely as characters: a box-drawing frame filled with a '·' dot
 * field, a RAMP-shaded phosphor trace (with decay) painted over the dots, and
 * readouts at the four corners. Same audio wiring / DSP math as MobileScope;
 * only the render is characters.
 */
export function AsciiScope() {
  const { isPlaying, mode, carrierLost, broadcastPlay, pause, analyserL, analyserR } = useAudio();
  const { rx, txFlash } = useSignalNet();

  const aLRef = useRef<AnalyserNode | null>(null);
  const aRRef = useRef<AnalyserNode | null>(null);
  useEffect(() => { aLRef.current = analyserL; }, [analyserL]);
  useEffect(() => { aRRef.current = analyserR; }, [analyserR]);

  const isBroadcasting = mode === 'broadcast' && isPlaying;
  const liveRef = useRef(false);
  useEffect(() => { liveRef.current = isBroadcasting; }, [isBroadcasting]);
  const deadAirRef = useRef(false);
  useEffect(() => { deadAirRef.current = carrierLost; }, [carrierLost]);

  // RX is React state; mirror to a ref so the stable rAF draw can read it.
  const rxRef = useRef<number | null>(null);
  useEffect(() => { rxRef.current = rx; }, [rx]);

  const bufLRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const bufRRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));

  // Persistent phosphor buffer — survives across frames (reallocated on resize,
  // wiped on a source switch so stopping doesn't smear the last loud frame).
  const accRef = useRef<Float32Array>(new Float32Array(0));
  const accDimRef = useRef({ cols: 0, rows: 0 });
  const srcRef = useRef('');

  const sphereRef = useRef<[number, number, number][]>([]);
  useEffect(() => {
    const N = 900;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const pts: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * golden;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    sphereRef.current = pts;
  }, []);

  const draw = useCallback((g: Grid, cols: number, rows: number, t: number) => {
    if (cols < 20 || rows < 12) return;
    const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
    const rx = cols * 0.42, ry = rows * 0.42;   // live trace fills the box

    const live = liveRef.current;
    const aL = aLRef.current, aR = aRRef.current;
    const src = deadAirRef.current ? 'dead' : (live && aL && aR) ? 'live' : 'idle';

    // ---- phosphor accumulator -------------------------------------------
    if (accDimRef.current.cols !== cols || accDimRef.current.rows !== rows) {
      accRef.current = new Float32Array(cols * rows);
      accDimRef.current = { cols, rows };
    } else if (src !== srcRef.current) {
      accRef.current.fill(0);
    }
    srcRef.current = src;
    const acc = accRef.current;
    for (let i = 0; i < acc.length; i++) acc[i] *= DECAY;

    const hit = (x: number, y: number, amp: number) => {
      const c = Math.round(x), r = Math.round(y);
      if (c <= 0 || c >= cols - 1 || r <= 0 || r >= rows - 1) return;
      const i = r * cols + c;
      if (amp > acc[i]) acc[i] = amp;   // newest sweep wins over the fading tail
    };

    if (src === 'dead') {
      // Dead air: a flat jittering line across the scope — the no-signal look.
      for (let x = 1; x < cols - 1; x += 0.5) {
        hit(x, cy, 0.55 + 0.45 * Math.abs(Math.sin(x * 12.9898 + t * 2)));
      }
    } else if (src === 'live') {
      const bufL = bufLRef.current, bufR = bufRRef.current;
      aL!.getFloatTimeDomainData(bufL);
      aR!.getFloatTimeDomainData(bufR);
      const stride = Math.max(1, Math.floor(bufL.length / SAMPLES));
      for (let i = 0; i < SAMPLES; i++) {
        const l = bufL[i * stride], r = bufR[i * stride];
        const amp = Math.min(1, Math.hypot(l, r) * 1.4);
        hit(cx + (r - l) * rx, cy - (l + r) * ry, amp);
      }
    } else {
      // Idle: a small, slowly tumbling point-sphere near the centre (kept well
      // inside the dot field so it reads as a compact figure, not a blob that
      // fills the box). aspect-corrected so it's round, not tall.
      const Rs = Math.min(rx, ry) * 0.30;
      const ryr = t * 0.32, rxr = 0.22 * Math.sin(t * 0.4);
      const cosY = Math.cos(ryr), sinY = Math.sin(ryr);
      const cosX = Math.cos(rxr), sinX = Math.sin(rxr);
      const pts = sphereRef.current;
      for (let i = 0; i < pts.length; i++) {
        const [px, py, pz] = pts[i];
        const def = 1 + 0.06 * Math.sin(py * 4 + t * 1.2) + 0.04 * Math.sin(px * 5 - t);
        const x = px * def, y = py * def, z = pz * def;
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        hit(cx + x1 * Rs, cy + y1 * Rs * CELL_ASPECT, 0.32 + 0.68 * ((z2 + 1) / 2));
      }
    }

    // ---- render (painter's order: frame → dot field → trace → labels) ----
    box(g, 0, 0, cols - 1, rows - 1, FRAME);

    // Dot field fills the whole box — every other column, every row — the calm
    // lattice the trace pops against. Trace is painted over it next.
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c += 2) text(g, c, r, FIELD);
    }

    // Phosphor trace — upper RAMP band so the faintest tail still outweighs a dot.
    const span = RAMP.length - 1 - TRACE_LO;
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const d = acc[r * cols + c];
        if (d > 0.05) text(g, c, r, RAMP[TRACE_LO + Math.round(Math.min(1, d) * span)]);
      }
    }

    // Corner readouts — last, so they replace whichever dots sit in those cells.
    const rightAt = (str: string, row: number) => text(g, cols - 2 - str.length, row, str);
    const utc = new Date().toISOString().slice(11, 19) + 'Z';
    text(g, 2, 1, live ? '> BROADCAST' : '> STANDBY');
    rightAt(utc, 1);
    text(g, 2, rows - 2, live ? '[||] ON AIR' : '[>] OFFLINE');
    if (rxRef.current !== null) text(g, 2, rows - 3, `RX:${rxRef.current}`);
    rightAt('X-Y L/R PHASE', rows - 2);
  }, []);

  const onTap = () => {
    if (isBroadcasting) pause(); else broadcastPlay();
  };

  return (
    <div onClick={onTap} style={{ position: 'absolute', inset: 0, background: 'transparent', cursor: 'pointer' }}>
      <AsciiGrid draw={draw} />

      {/* Only TX RECEIVED stays HTML — the red accent can't live in the
          single-tone <pre>; everything else is drawn into the grid. */}
      {txFlash && (
        <span aria-hidden style={{
          position: 'absolute', right: 8, top: 44, pointerEvents: 'none',
          fontFamily: MONO, fontSize: 7, lineHeight: 1, color: '#ff0000',
        }}>
          TX RECEIVED
        </span>
      )}
    </div>
  );
}
