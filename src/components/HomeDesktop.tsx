'use client';

import Link from 'next/link';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const DESKTOP = '#ffffff';
const INK = '#111';
const RULE = '#555';      // the card's hairlines

type Readout = { lvl: number; pk: number; corr: number; bal: number; drift: number };

/**
 * The station as a ruled index card, centred on the white: the clock across the top, the call
 * sign beside a play/pause and the state (ON AIR blinking when live, TEST when not), then
 * unlabelled readouts beside a Lissajous of the stereo field. The readouts never sit still:
 * off air they read a drifting noise floor. README and RADAR top-right; the prompt is global
 * (see SiteFrame). The StationBar stays off here.
 */
export function HomeDesktop() {
  const { analyserL, analyserR, isPlaying, mode, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const [clock, setClock] = useState<string | null>(null);
  const [rd, setRd] = useState<Readout | null>(null);
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
    let drift = 0;   // a slow random walk, always moving
    const tick = () => {
      setClock(stationClock());
      drift = Math.max(-9.9, Math.min(9.9, drift + (Math.random() - 0.5) * 0.6));
      const [aL, aR] = ch.current;
      let ll = 0, rr = 0, lr = 0, pk = 0, n = 1;
      if (aL && aR) {
        if (l.length !== aL.fftSize) { l = new Float32Array(aL.fftSize); r = new Float32Array(aL.fftSize); }
        aL.getFloatTimeDomainData(l); aR.getFloatTimeDomainData(r);
        n = l.length;
        for (let i = 0; i < n; i++) {
          ll += l[i] * l[i]; rr += r[i] * r[i]; lr += l[i] * r[i];
          pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i]));
        }
      }
      if (ll + rr < 1e-9) {
        // silence: read the noise floor instead, so nothing ever freezes
        const lvl = -78 + Math.random() * 4;
        return setRd({ lvl, pk: lvl + 5 + Math.random() * 3, corr: (Math.random() - 0.5) * 0.2, bal: (Math.random() - 0.5) * 0.1, drift });
      }
      setRd({
        lvl: 10 * Math.log10((ll + rr) / (2 * n)),
        pk: 20 * Math.log10(pk || 1e-6),
        corr: ll && rr ? lr / Math.sqrt(ll * rr) : 0,
        bal: (Math.sqrt(rr) - Math.sqrt(ll)) / (Math.sqrt(rr) + Math.sqrt(ll)),
        drift,
      });
    };
    tick();
    const t = setInterval(tick, 150);
    return () => clearInterval(t);
  }, []);

  // the Lissajous: white on black, L against R turned 45° so mono stands upright, over faint
  // axes; a faint noise floor off air
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
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const R = Math.min(w, h) / 2 - 6, cx = w / 2, cy = h / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(cy) + 0.5); ctx.lineTo(w, Math.round(cy) + 0.5);
      ctx.moveTo(Math.round(cx) + 0.5, 0); ctx.lineTo(Math.round(cx) + 0.5, h);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      const [aL, aR] = ch.current;
      if (aL && aR) {
        if (l.length !== aL.fftSize) { l = new Float32Array(aL.fftSize); r = new Float32Array(aL.fftSize); }
        aL.getFloatTimeDomainData(l); aR.getFloatTimeDomainData(r);
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < l.length; i += 2) {
          const x = Math.max(-1, Math.min(1, (r[i] - l[i]) * 0.9));
          const y = Math.max(-1, Math.min(1, (l[i] + r[i]) * 0.9));
          ctx.fillRect(cx + x * R - 0.6, cy - y * R - 0.6, 1.2, 1.2);
        }
      } else {
        ctx.globalAlpha = 0.5;
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

  const num = (v: number | undefined, d: number, sign = false) =>
    v == null ? '--' : (sign && v >= 0 ? '+' : '') + v.toFixed(d);
  const rows: [string, string][] = [
    ['LVL', `${num(rd?.lvl, 1)} DB`],
    ['PK', `${num(rd?.pk, 1)} DB`],
    ['CF', `${num(rd && rd.pk - rd.lvl, 1)} DB`],
    ['CORR', num(rd?.corr, 2, true)],
    ['BAL', num(rd?.bal, 2, true)],
    ['DRFT', `${num(rd?.drift, 1, true)} PPM`],
  ];

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', inset: 0, paddingBottom: PROMPT_BAND,
      overflow: 'hidden', overscrollBehavior: 'contain',
      fontFamily: MONO, color: INK, background: DESKTOP,
    }}>
      <style>{`
        .card { position: absolute; left: 50%; top: calc(50% - ${PROMPT_BAND / 2}px); transform: translate(-50%, -50%);
          width: min(360px, calc(100vw - 32px)); border: 1px solid ${RULE}; font-size: 11px; letter-spacing: 0.06em; }
        .card > * + * { border-top: 1px solid ${RULE}; }
        .card .clock { text-align: center; font-size: 20px; letter-spacing: 0.42em; padding: 12px 0 12px 0.42em; font-variant-numeric: tabular-nums; }
        .card .row { display: grid; }
        .card .row > * + * { border-left: 1px solid ${RULE}; }
        .card .sign { grid-template-columns: 52% 48%; }
        .card .sign > * { padding: 10px 12px; display: flex; align-items: center; justify-content: center; gap: 9px; }
        .card .sign button { all: unset; cursor: pointer; display: grid; place-items: center; width: 16px; height: 16px; border: 1px solid ${INK}; }
        .card .sign button:active { transform: scale(0.92); }
        .card .state { width: 6.5em; display: flex; align-items: center; gap: 7px; }
        .card .dot { width: 7px; height: 7px; border-radius: 50%; border: 1px solid ${INK}; }
        .card .dot.on { background: ${INK}; animation: blink 1s steps(1) infinite; }
        @keyframes blink { 50% { opacity: 0; } }
        .card .body { grid-template-columns: 54% 46%; height: 112px; }
        .card .data { padding: 8px 12px; display: grid; grid-template-columns: auto 1fr; align-content: space-between;
          column-gap: 12px; font-variant-numeric: tabular-nums; }
        .card .data b { font-weight: 400; }
        .card .data span { text-align: right; white-space: pre; }
        .card canvas { width: 100%; height: 100%; display: block; }
        @media (max-width: 715px) {
          .card { font-size: 10px; }
          .card .clock { font-size: 18px; }
        }
      `}</style>

      <div className="card">
        <div className="clock">{clock ?? '--:--:--'}</div>
        <div className="row sign">
          <div>VGF-8194</div>
          <div>
            <button onClick={() => (live ? pause() : broadcastPlay())} aria-label={live ? 'Pause the station' : 'Play the station'}>
              <svg viewBox="0 0 8 9" fill="currentColor" aria-hidden width="7" height="8">
                {live ? <><rect x="0" y="0" width="2.5" height="9" /><rect x="5.5" y="0" width="2.5" height="9" /></>
                  : <path d="M0 0 L8 4.5 L0 9 Z" />}
              </svg>
            </button>
            <span className="state"><i className={live ? 'dot on' : 'dot'} />{live ? 'ON AIR' : 'TEST'}</span>
          </div>
        </div>
        <div className="row body">
          <div className="data">
            {rows.flatMap(([k, v]) => [<b key={k}>{k}</b>, <span key={k + 'v'}>{v}</span>])}
          </div>
          <canvas ref={scope} aria-hidden />
        </div>
      </div>

      {/* README and RADAR — top-right corner */}
      <Link href="/station/readme" style={{ position: 'absolute', top: 24, right: 24, zIndex: 5, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)', textDecoration: 'none' }}>
        README
      </Link>
      <Link href="/station/radar" style={{ position: 'absolute', top: 44, right: 24, zIndex: 5, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)', textDecoration: 'none' }}>
        RADAR
      </Link>
    </div>
  );
}
