'use client';

import Link from 'next/link';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { VISUAL_TRIM_DB } from '@/lib/audio/loudness';
import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const WHITE = '#ffffff';
const W = 104, H = 64;    // the Lissajous window
const REACH = 28, DOT = 1.75;  // full scale, in px, stops short of the edges
const STEP = 8, TEST_STEP = 20;   // samples between dots, so each stays its own light

type Readout = { lvl: string; pk: string; corr: string; bal: string };

/**
 * The station as a small white outline in the top-left corner: the call sign, clock, state and
 * readouts, then at its right end a bordered Lissajous of the stereo field in glowing dots. Off
 * air it and the readouts follow a test signal, so nothing stops. README and RADAR top-right; the
 * prompt is global (see SiteFrame). The StationBar stays off here.
 */
export function HomeDesktop() {
  const { analyserL, analyserR, isPlaying, mode, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const [clock, setClock] = useState<string | null>(null);
  const [rd, setRd] = useState<Readout | null>(null);
  const ch = useRef({ aL: analyserL, aR: analyserR });
  ch.current = { aL: analyserL, aR: analyserR };
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    let l = new Float32Array(2048), r = new Float32Array(2048);
    let nextRead = 0, raf = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const { aL, aR } = ch.current;
      const t = now / 1000;

      // the broadcast, or the test signal whenever nothing's flowing
      let energy = 0;
      if (aL && aR) {
        if (l.length !== aL.fftSize) { l = new Float32Array(aL.fftSize); r = new Float32Array(aL.fftSize); }
        aL.getFloatTimeDomainData(l); aR.getFloatTimeDomainData(r);
        for (let i = 0; i < l.length; i++) energy += l[i] * l[i] + r[i] * r[i];
      }
      const testing = energy < 1e-9;
      if (testing) {
        const amp = 0.58 + 0.04 * Math.sin(t * 0.7), w = (Math.PI * 2) / l.length;
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

      // R against L in a square, so mono runs up the diagonal; full scale stops short of the edges
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = WHITE;
      const gain = testing ? 1 : Math.pow(10, VISUAL_TRIM_DB / 20);
      for (let i = 0; i < l.length; i += testing ? TEST_STEP : STEP) {
        const x = W / 2 + Math.max(-1, Math.min(1, r[i] * gain)) * REACH;
        const y = H / 2 - Math.max(-1, Math.min(1, l[i] * gain)) * REACH;
        ctx.fillRect(Math.round(x - DOT / 2), Math.round(y - DOT / 2), DOT, DOT);
      }
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
        /* all white, drawn straight on the page: the type and borders barely glow, the lights do */
        .plate { position: absolute; top: 24px; left: 24px; display: flex; gap: 6px; padding: 6px; color: ${WHITE}; border: 1px solid ${WHITE};
          font-size: 11px; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; white-space: pre;
          text-shadow: 0 0 3px rgba(255,255,255,0.3); box-shadow: 0 0 3px rgba(255,255,255,0.3); }
        .plate .info { padding: 3px 12px 3px 6px; display: grid; grid-template-columns: auto auto; column-gap: 22px; row-gap: 3px; align-content: center; }
        .plate .info .end { text-align: right; }
        .plate button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 7px; padding: 6px 12px 6px 0; margin: -6px 0; }
        .plate button:active { opacity: 0.6; }
        .plate .lamp { width: 6px; height: 6px; background: currentColor; animation: lamp 1s steps(1) infinite; }
        @keyframes lamp { 50% { opacity: 0; } }
        .plate .window { border: 1px solid ${WHITE}; display: flex; box-shadow: 0 0 3px rgba(255,255,255,0.3); }
        .plate canvas { display: block; width: ${W}px; height: ${H}px; margin: auto 6px;
          filter: drop-shadow(0 0 3px rgba(255,255,255,0.95)) drop-shadow(0 0 9px rgba(255,255,255,0.7)); }
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
