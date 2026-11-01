'use client';

import Link from 'next/link';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const TICK = 12;          // room the tick labels take outside the plot
// the border's layers, in px, and their inks as measured off the reference
const BAND = 36, RULE = 3, RULE_INSET = 6, IN = RULE_INSET + RULE;
const METRICS = 40;      // the readout strip's height, attached to the top of the frame
const BAND_INK = '#1e1715', RULE_INK = '#e94e29', KEYLINE = '#c7d6b8', BAND_TEXT = '#f4f4ec';

type Readout = { lvl: string; pk: string; corr: string; bal: string };

/**
 * The station as a figure, drawn straight on the page: the stereo field as a large Lissajous in
 * dots (x = right, y = left, so mono runs up the diagonal; full scale fits the plot, so the cloud
 * never reaches an edge), framed in a layered band that carries the call sign, clock and state,
 * with the readouts in a strip attached on top. Off
 * air it plots a test signal, so the figure and the readouts never stop; everything is measured
 * from whichever samples are on it. README and RADAR top-right; the prompt is global (see
 * SiteFrame). The StationBar stays off here.
 */
export function HomeDesktop() {
  const { analyserL, analyserR, isPlaying, mode, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const [clock, setClock] = useState<string | null>(null);
  const [rd, setRd] = useState<Readout | null>(null);
  const ch = useRef([analyserL, analyserR]);
  ch.current = [analyserL, analyserR];
  const plot = useRef<HTMLCanvasElement>(null);

  // the body's min-h-screen is iOS's LARGE viewport, taller than what's visible with the URL bar
  // up: drop it while the station is up, so the page has nothing to scroll (as HomeTemp does)
  useEffect(() => {
    const body = document.body;
    const prev = body.style.minHeight;
    body.style.minHeight = '0';
    return () => { body.style.minHeight = prev; };
  }, []);

  useEffect(() => {
    const canvas = plot.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let l = new Float32Array(2048), r = new Float32Array(2048);
    let nextRead = 0, raf = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const [aL, aR] = ch.current;

      // the samples on the figure: the broadcast, or the test signal whenever nothing's flowing
      let energy = 0;
      if (aL && aR) {
        if (l.length !== aL.fftSize) { l = new Float32Array(aL.fftSize); r = new Float32Array(aL.fftSize); }
        aL.getFloatTimeDomainData(l); aR.getFloatTimeDomainData(r);
        for (let i = 0; i < l.length; i++) energy += l[i] * l[i] + r[i] * r[i];
      }
      const testing = energy < 1e-9;
      if (testing) {
        const t = now / 1000, amp = 0.58 + 0.04 * Math.sin(t * 0.7), w = (Math.PI * 2) / l.length;
        for (let i = 0; i < l.length; i++) {
          l[i] = amp * Math.sin(3 * w * i) + (Math.random() - 0.5) * 0.006;
          r[i] = amp * Math.sin(2 * w * i + t * 0.25) + (Math.random() - 0.5) * 0.006;
        }
      }

      if (now >= nextRead) {
        nextRead = now + 150;
        let ll = 0, rr = 0, lr = 0, pk = 0;
        for (let i = 0; i < l.length; i++) {
          ll += l[i] * l[i]; rr += r[i] * r[i]; lr += l[i] * r[i];
          pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i]));
        }
        const sign = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);
        const db = (v: number) => v.toFixed(1).padStart(5);
        const sl = Math.sqrt(ll), sr = Math.sqrt(rr);
        setClock(stationClock());
        setRd({
          lvl: db(10 * Math.log10((ll + rr) / (2 * l.length) || 1e-12)),
          pk: db(20 * Math.log10(pk || 1e-6)),
          corr: sign(sl && sr ? lr / (sl * sr) : 0),
          bal: sign(sl + sr ? (sr - sl) / (sr + sl) : 0),
        });
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = canvas.clientWidth;
      if (canvas.width !== Math.round(size * dpr)) canvas.width = canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const css = getComputedStyle(canvas);
      const c = size / 2, R = c - TICK - 8;
      const snap = (v: number) => (Math.floor(v * dpr) + 0.5) / dpr;   // hairlines on the pixel grid

      // the axes, ticked at the half and at full scale
      ctx.strokeStyle = ctx.fillStyle = css.color;
      ctx.lineWidth = 1 / dpr;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(c - R, snap(c)); ctx.lineTo(c + R, snap(c));
      ctx.moveTo(snap(c), c - R); ctx.lineTo(snap(c), c + R);
      for (const v of [-1, -0.5, 0.5, 1]) {
        const h = Math.abs(v) === 1 ? 5 : 3;
        ctx.moveTo(snap(c + v * R), c - h); ctx.lineTo(snap(c + v * R), c + h);
        ctx.moveTo(c - h, snap(c + v * R)); ctx.lineTo(c + h, snap(c + v * R));
      }
      ctx.stroke();
      ctx.font = `10px ${css.fontFamily}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right'; ctx.fillText('-1', c - R - 3, c);
      ctx.fillText('+1 R', c + R, c - 12);
      ctx.textAlign = 'center';
      ctx.fillText('+1 L', c, c - R - 8);
      ctx.fillText('-1', c, c + R + 8);

      // the cloud: one window, every dot equal, no trailing
      ctx.globalAlpha = 1;
      const n = testing ? l.length : Math.min(1100, l.length);
      for (let i = 0; i < n; i += testing ? 7 : 1) {
        const x = c + Math.max(-1, Math.min(1, r[i])) * R;
        const y = c - Math.max(-1, Math.min(1, l[i])) * R;
        ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', inset: 0, paddingBottom: PROMPT_BAND,
      overflow: 'hidden', overscrollBehavior: 'contain',
      fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)', background: 'var(--vlg-bg, #fff)',
    }}>
      <style>{`
        /* the border: a heavy band with a thin rule set inside it, a keyline round the field, and
           the call sign, state and clock in the band; the readouts in their own strip on top */
        .fig { position: absolute; left: 50%; top: calc(50% - ${(PROMPT_BAND - METRICS) / 2}px); transform: translate(-50%, -50%);
          box-sizing: border-box; width: calc(0.75 * min(100vw - 32px, 100dvh - ${PROMPT_BAND + 120}px) + ${BAND * 2}px); margin: 0; padding: ${BAND}px;
          background: ${BAND_INK}; color: ${BAND_TEXT}; font-size: 11px; font-variant-numeric: tabular-nums; white-space: pre; }
        .fig::before { content: ''; position: absolute; inset: ${RULE_INSET}px; border: ${RULE}px solid ${RULE_INK}; pointer-events: none; }
        .fig canvas { display: block; box-sizing: border-box; width: 100%; aspect-ratio: 1; border: ${RULE}px solid ${KEYLINE};
          background: var(--vlg-bg, #fff); color: var(--vlg-fg, #000); font-family: inherit; }
        .fig .edge { position: absolute; display: flex; align-items: center; justify-content: center; gap: 18px; }
        .fig .top, .fig .bottom { left: ${IN}px; right: ${IN}px; height: ${BAND - IN}px; }
        .fig .top { top: ${IN}px; font-size: 14px; letter-spacing: 0.2em; }
        .fig .bottom { bottom: ${IN}px; }
        .fig .metrics { position: absolute; left: 0; right: 0; bottom: 100%; height: ${METRICS}px; box-sizing: border-box; padding: 0 ${IN + 10}px;
          display: flex; align-items: center; justify-content: space-between; background: ${BAND_INK}; }
        .fig .metrics::before { content: ''; position: absolute; inset: ${RULE_INSET}px; border: ${RULE}px solid ${RULE_INK}; pointer-events: none; }
        .fig button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 8px; height: 100%; }
        .fig button:active { opacity: 0.6; }
        .fig .lamp { width: 7px; height: 7px; background: ${RULE_INK}; animation: lamp 1s steps(1) infinite; }
        @keyframes lamp { 50% { opacity: 0; } }
        @media (max-width: 899px) {
          .fig { width: min(100vw - 32px, 100dvh - ${PROMPT_BAND + 120}px); }
          .fig .metrics { letter-spacing: 0; font-size: 10px; }
        }
      `}</style>

      <figure className="fig">
        <canvas ref={plot} aria-hidden />
        <div className="edge top">VGF-8194</div>
        <div className="edge bottom">
          <button onClick={() => (live ? pause() : broadcastPlay())} aria-label={live ? 'Pause the station' : 'Play the station'}>
            <svg viewBox="0 0 8 9" fill="currentColor" aria-hidden width="8" height="9">
              {live ? <><rect x="0" y="0" width="2.5" height="9" /><rect x="5.5" y="0" width="2.5" height="9" /></>
                : <path d="M0 0 L8 4.5 L0 9 Z" />}
            </svg>
            {live ? 'ON AIR' : 'TEST'}
            {live && <i className="lamp" />}
          </button>
          <span>{clock ?? '--:--:--'}</span>
        </div>
        <div className="metrics">
          <span>LVL {rd?.lvl ?? '   --'} DB</span>
          <span>PK {rd?.pk ?? '   --'} DB</span>
          <span>CORR {rd?.corr ?? '   --'}</span>
          <span>BAL {rd?.bal ?? '   --'}</span>
        </div>
      </figure>

      {/* README and RADAR — top-right corner */}
      <Link href="/station/readme" style={{ position: 'absolute', top: 24, right: 24, zIndex: 5, color: 'inherit', textDecoration: 'none' }}>
        README
      </Link>
      <Link href="/station/radar" style={{ position: 'absolute', top: 44, right: 24, zIndex: 5, color: 'inherit', textDecoration: 'none' }}>
        RADAR
      </Link>
    </div>
  );
}
