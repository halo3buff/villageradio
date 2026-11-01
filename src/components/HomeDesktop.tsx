'use client';

import Link from 'next/link';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const WHITE = '#fcfcfc';  // the reference's lit white, as measured
const COLS = 13, ROWS = 8, PITCH = 8, DOT = 5.4;   // the light field
// a 4x4 ordered-dither matrix: each dot lights once the field passes its threshold
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

type Readout = { lvl: string; pk: string; corr: string; bal: string };

/**
 * The station as a small white plate in the top-left corner: the call sign, clock, state and
 * readouts, then at its right end a window onto the page holding a field of lights, the spectrum
 * dithered into dots (low notes left), each easing on and off. Off air the field drifts slowly and
 * the readouts follow a test signal, so nothing stops. README and RADAR top-right; the prompt is
 * global (see SiteFrame). The StationBar stays off here.
 */
export function HomeDesktop() {
  const { analyserL, analyserR, analyserFreq, isPlaying, mode, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const [clock, setClock] = useState<string | null>(null);
  const [rd, setRd] = useState<Readout | null>(null);
  const ch = useRef({ aL: analyserL, aR: analyserR, aF: analyserFreq });
  ch.current = { aL: analyserL, aR: analyserR, aF: analyserFreq };
  const lights = useRef<HTMLCanvasElement>(null);

  // the body's min-h-screen is iOS's LARGE viewport, taller than what's visible with the URL bar
  // up: drop it while the station is up, so the page has nothing to scroll (as HomeTemp does)
  useEffect(() => {
    const body = document.body;
    const prev = body.style.minHeight;
    body.style.minHeight = '0';
    return () => { body.style.minHeight = prev; };
  }, []);

  useEffect(() => {
    const canvas = lights.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const W = COLS * PITCH, H = ROWS * PITCH;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    let l = new Float32Array(2048), r = new Float32Array(2048);
    let spec = new Uint8Array(0);
    const glow = new Float32Array(COLS * ROWS);   // each dot's light, eased
    let nextRead = 0, raf = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const { aL, aR, aF } = ch.current;
      const t = now / 1000;

      // the readouts: the broadcast, or the test signal whenever nothing's flowing
      if (now >= nextRead) {
        nextRead = now + 150;
        let energy = 0;
        if (aL && aR) {
          if (l.length !== aL.fftSize) { l = new Float32Array(aL.fftSize); r = new Float32Array(aL.fftSize); }
          aL.getFloatTimeDomainData(l); aR.getFloatTimeDomainData(r);
          for (let i = 0; i < l.length; i++) energy += l[i] * l[i] + r[i] * r[i];
        }
        if (energy < 1e-9) {
          const amp = 0.58 + 0.04 * Math.sin(t * 0.7), w = (Math.PI * 2) / l.length;
          for (let i = 0; i < l.length; i++) {
            l[i] = amp * Math.sin(3 * w * i) + (Math.random() - 0.5) * 0.006;
            r[i] = amp * Math.sin(2 * w * i + t * 0.25) + (Math.random() - 0.5) * 0.006;
          }
        }
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

      // the spectrum, one log-spaced band to a column (40 Hz to 12 kHz)
      let sum = 0;
      if (aF) {
        if (spec.length !== aF.frequencyBinCount) spec = new Uint8Array(aF.frequencyBinCount);
        aF.getByteFrequencyData(spec);
        for (let i = 0; i < spec.length; i++) sum += spec[i];
      }
      const hz = aF ? aF.context.sampleRate / aF.fftSize : 1;
      const on = sum > 0;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = WHITE;
      for (let x = 0; x < COLS; x++) {
        let band = 0;
        if (on) {
          const a = 40 * Math.pow(300, x / COLS), b = 40 * Math.pow(300, (x + 1) / COLS);
          const i0 = Math.floor(a / hz), i1 = Math.max(i0 + 1, Math.ceil(b / hz));
          for (let i = i0; i < i1; i++) band = Math.max(band, spec[i] ?? 0);
          band /= 255;
        }
        for (let y = 0; y < ROWS; y++) {
          const up = 1 - y / (ROWS - 1);   // 0 at the bottom row, 1 at the top
          const field = on
            ? Math.pow(band, 2) * 1.5 - up * 0.8
            : 0.42 + 0.34 * Math.sin(x * 0.55 + t * 0.35) * Math.sin(y * 0.8 - t * 0.27);
          const k = y * COLS + x;
          const target = field > BAYER[(y % 4) * 4 + (x % 4)] ? 1 : 0;
          glow[k] += (target - glow[k]) * (target ? 0.3 : 0.07);   // quick on, slow off, like a lamp
          const a = 0.16 + 0.84 * glow[k];
          ctx.globalAlpha = a;
          ctx.shadowColor = WHITE;
          ctx.shadowBlur = glow[k] * 7;
          ctx.beginPath();
          ctx.arc((x + 0.5) * PITCH, (y + 0.5) * PITCH, DOT / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', inset: 0, paddingBottom: PROMPT_BAND,
      overflow: 'hidden', overscrollBehavior: 'contain',
      fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)',
    }}>
      <style>{`
        .plate { position: absolute; top: 24px; left: 24px; display: flex; color: #111; font-size: 11px; letter-spacing: 0.04em;
          font-variant-numeric: tabular-nums; white-space: pre; filter: drop-shadow(0 0 14px rgba(255,255,255,0.4)); }
        .plate .info { background: ${WHITE}; padding: 9px 14px 9px 12px; display: grid; grid-template-columns: auto auto; column-gap: 22px; row-gap: 3px; align-content: center; }
        .plate .info .end { text-align: right; }
        .plate button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 7px; padding: 6px 12px 6px 0; margin: -6px 0; }
        .plate button:active { opacity: 0.6; }
        .plate .lamp { width: 6px; height: 6px; background: currentColor; animation: lamp 1s steps(1) infinite; }
        @keyframes lamp { 50% { opacity: 0; } }
        /* the window: the plate's white runs round it, the page shows through, the lights on that */
        .plate .window { border: 4px solid ${WHITE}; border-left-width: 0; display: flex; }
        .plate canvas { display: block; width: ${COLS * PITCH}px; height: ${ROWS * PITCH}px; margin: auto 6px; }
        @media (max-width: 715px) {
          .plate { top: 72px; left: 16px; }
        }
      `}</style>

      <div className="plate">
        <div className="info">
          <span>VGF-8194</span>
          <span className="end">{clock ?? '--:--:--'}</span>
          <button onClick={() => (live ? pause() : broadcastPlay())} aria-label={live ? 'Pause the station' : 'Play the station'}>
            <svg viewBox="0 0 8 9" fill="currentColor" aria-hidden width="7" height="8">
              {live ? <><rect x="0" y="0" width="2.5" height="9" /><rect x="5.5" y="0" width="2.5" height="9" /></>
                : <path d="M0 0 L8 4.5 L0 9 Z" />}
            </svg>
            {live ? 'ON AIR' : 'TEST'}
            {live && <i className="lamp" />}
          </button>
          <span />
          <span>LVL {rd?.lvl ?? '   --'} DB</span>
          <span className="end">PK {rd?.pk ?? '   --'} DB</span>
          <span>CORR {rd?.corr ?? '   --'}</span>
          <span className="end">BAL {rd?.bal ?? '   --'}</span>
        </div>
        <div className="window"><canvas ref={lights} aria-hidden /></div>
      </div>

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
