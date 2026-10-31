'use client';

import Link from 'next/link';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PIXEL = "var(--font-vt323), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const DESKTOP = '#ffffff';
const INK = '#111';
const RULE = '#555';      // the card's hairlines

/**
 * Two things on the white:
 * - top-left, the tree in its icon box beside the clock over a rule, README and RADAR under it;
 * - centred, the station as a ruled index card: the clock across the top, the call sign and an
 *   ON AIR toggle (blinking dot when live; tapping it plays or pauses), then unlabelled readouts
 *   beside a Lissajous of the stereo field.
 * The prompt is global (see SiteFrame). The StationBar stays off here.
 */
export function HomeDesktop() {
  const { analyserL, analyserR, isPlaying, mode, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const [clock, setClock] = useState<string | null>(null);
  // level (dBFS RMS), peak (dBFS) and L/R correlation, deliberately left vague
  const [rate, setRate] = useState<[number, number, number] | null>(null);
  const ch = useRef([analyserL, analyserR]);
  ch.current = [analyserL, analyserR];
  const scope = useRef<HTMLCanvasElement>(null);

  // the body's min-h-screen is iOS's LARGE viewport, taller than what's visible with the URL bar
  // up: drop it while the station is up, so the page has nothing to scroll (as HomeTemp does)
  useEffect(() => {
    const body = document.body;
    const prev = [body.style.minHeight, body.style.background];
    body.style.minHeight = '0';
    body.style.background = DESKTOP;   // white under the prompt band too
    return () => { [body.style.minHeight, body.style.background] = prev; };
  }, []);

  useEffect(() => {
    let l = new Float32Array(0), r = new Float32Array(0);
    const tick = () => {
      setClock(stationClock());
      const [aL, aR] = ch.current;
      if (!aL || !aR) return setRate(null);
      if (l.length !== aL.fftSize) { l = new Float32Array(aL.fftSize); r = new Float32Array(aL.fftSize); }
      aL.getFloatTimeDomainData(l); aR.getFloatTimeDomainData(r);
      let ll = 0, rr = 0, lr = 0, pk = 0;
      for (let i = 0; i < l.length; i++) {
        ll += l[i] * l[i]; rr += r[i] * r[i]; lr += l[i] * r[i];
        pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i]));
      }
      setRate([
        10 * Math.log10((ll + rr) / (2 * l.length) || 1e-12),
        20 * Math.log10(pk || 1e-6),
        ll && rr ? lr / Math.sqrt(ll * rr) : 0,
      ]);
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, []);

  // the Lissajous: L against R turned 45°, so mono stands upright; a faint noise floor off air
  useEffect(() => {
    let raf = 0;
    let l = new Float32Array(0), r = new Float32Array(0);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = scope.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) / 2 - 4, cx = w / 2, cy = h / 2;
      ctx.fillStyle = INK;
      const [aL, aR] = ch.current;
      if (aL && aR) {
        if (l.length !== aL.fftSize) { l = new Float32Array(aL.fftSize); r = new Float32Array(aL.fftSize); }
        aL.getFloatTimeDomainData(l); aR.getFloatTimeDomainData(r);
        ctx.globalAlpha = 0.75;
        for (let i = 0; i < l.length; i += 2) {
          const x = Math.max(-1, Math.min(1, (r[i] - l[i]) * 0.9));
          const y = Math.max(-1, Math.min(1, (l[i] + r[i]) * 0.9));
          ctx.fillRect(cx + x * R - 0.6, cy - y * R - 0.6, 1.2, 1.2);
        }
      } else {
        ctx.globalAlpha = 0.35;
        for (let i = 0; i < 120; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * Math.random() * R * 0.12;
          ctx.fillRect(cx + Math.cos(a) * d - 0.5, cy + Math.sin(a) * d - 0.5, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const db = (v?: number) => (v == null ? '--.-' : v.toFixed(1)).padStart(6);

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', inset: 0, paddingBottom: PROMPT_BAND,
      overflow: 'hidden', overscrollBehavior: 'contain',
      fontFamily: MONO, color: INK, background: DESKTOP,
    }}>
      <style>{`
        .lcd { position: absolute; top: 24px; left: 24px; width: min(300px, calc(100vw - 48px));
          color: ${INK}; font-family: ${PIXEL}; font-size: 18px; line-height: 1; display: flex; gap: 8px; }
        /* the icon box: the tree, inked through a mask, a bar down its right side */
        .lcd .icon { flex: none; width: 2.6em; border: 2px solid ${INK}; border-radius: 5px; border-right-width: 5px; display: grid; place-items: center; }
        .lcd .icon i { width: 100%; aspect-ratio: 1; background: ${INK};
          -webkit-mask: url(/images/tree_8bit.png) center / 140% no-repeat; mask: url(/images/tree_8bit.png) center / 140% no-repeat; }
        .lcd .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .lcd .head { border-bottom: 2px solid ${INK}; padding-bottom: 2px; margin-bottom: 2px; }
        .lcd a { color: inherit; text-decoration: none; width: fit-content; }
        .lcd a:hover { text-decoration: underline; }

        .card { position: absolute; left: 50%; top: calc(50% - ${PROMPT_BAND / 2}px); transform: translate(-50%, -50%);
          width: min(360px, calc(100vw - 32px)); border: 1px solid ${RULE}; font-size: 11px; letter-spacing: 0.06em; }
        .card > * + * { border-top: 1px solid ${RULE}; }
        .card .clock { text-align: center; font-size: 20px; letter-spacing: 0.42em; padding: 12px 0 12px 0.42em; font-variant-numeric: tabular-nums; }
        .card .row { display: grid; }
        .card .row > * + * { border-left: 1px solid ${RULE}; }
        .card .sign { grid-template-columns: 62% 38%; }
        .card .sign > * { padding: 10px 12px; text-align: center; }
        .card .sign button { all: unset; cursor: pointer; text-align: center; padding: 10px 12px; }
        .card .sign button:active { opacity: 0.6; }
        .card .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; border: 1px solid ${INK}; margin-right: 7px; }
        .card .dot.on { background: ${INK}; animation: blink 1s steps(1) infinite; }
        @keyframes blink { 50% { opacity: 0; } }
        .card .body { grid-template-columns: 54% 46%; height: 112px; }
        .card .data { padding: 10px 12px; line-height: 1.35; white-space: pre; font-variant-numeric: tabular-nums; }
        .card canvas { width: 100%; height: 100%; display: block; }
        @media (max-width: 715px) {
          .lcd { top: 80px; font-size: 16px; }
          .card { font-size: 10px; }
          .card .clock { font-size: 18px; }
        }
      `}</style>
      <div className="lcd">
        <div className="icon"><i role="img" aria-label="Village Radio" /></div>
        <div className="text">
          <div className="head">{clock ?? '--:--:--'} ET:</div>
          <Link href="/station/readme">README</Link>
          <Link href="/station/radar">RADAR</Link>
        </div>
      </div>

      <div className="card">
        <div className="clock">{clock ?? '--:--:--'}</div>
        <div className="row sign">
          <div>VGF-8194</div>
          <button onClick={() => (live ? pause() : broadcastPlay())} aria-label={live ? 'Pause the station' : 'Play the station'}>
            <span className={live ? 'dot on' : 'dot'} />LIVE / ON AIR
          </button>
        </div>
        <div className="row body">
          <div className="data">{[
            'SIGNAL:',
            `LVL  ${db(rate?.[0])} DB`,
            `PK   ${db(rate?.[1])} DB`,
            `CORR ${rate ? (rate[2] >= 0 ? '+' : '') + rate[2].toFixed(2) : ' -.--'}`,
          ].join('\n')}</div>
          <canvas ref={scope} aria-hidden />
        </div>
      </div>
    </div>
  );
}
