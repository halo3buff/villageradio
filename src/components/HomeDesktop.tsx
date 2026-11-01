'use client';

import Link from 'next/link';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const TICK = 12;          // room the tick labels take outside the plot

type Readout = { lvl: string; pk: string; corr: string; bal: string };

/**
 * The station as a figure, drawn straight on the page: the stereo field as a large Lissajous in
 * dots (x = right, y = left, so mono runs up the diagonal; full scale fits the plot, so the cloud
 * never reaches an edge), the call sign, clock, state and readouts set small in its margins. Off
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
      ctx.globalAlpha = 0.45;
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
      ctx.textAlign = 'left'; ctx.fillText('+1 R', c + R + 3, c);
      ctx.textAlign = 'center';
      ctx.fillText('+1 L', c, c - R - 8);
      ctx.fillText('-1', c, c + R + 8);

      // the cloud: one window, every dot equal, no trailing
      ctx.globalAlpha = 0.72;
      const n = testing ? l.length : Math.min(1100, l.length);
      for (let i = 0; i < n; i += testing ? 7 : 1) {
        const x = c + Math.max(-1, Math.min(1, r[i])) * R;
        const y = c - Math.max(-1, Math.min(1, l[i])) * R;
        ctx.fillRect(x - 0.65, y - 0.65, 1.3, 1.3);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rows: [string, string | null | undefined][] = [
    ['LVL', rd && `${rd.lvl} DB`], ['PK', rd && `${rd.pk} DB`], ['CORR', rd?.corr], ['BAL', rd?.bal],
  ];

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', inset: 0, paddingBottom: PROMPT_BAND,
      overflow: 'hidden', overscrollBehavior: 'contain',
      fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)', background: 'var(--vlg-bg, #fff)',
    }}>
      <style>{`
        .fig { position: absolute; left: 50%; top: calc(50% - ${PROMPT_BAND / 2}px); transform: translate(-50%, -50%);
          width: calc(0.75 * min(100vw - 32px, 100dvh - ${PROMPT_BAND + 120}px)); aspect-ratio: 1; }
        .fig canvas { display: block; width: 100%; height: 100%; color: inherit; font-family: inherit; }
        .fig .line { position: absolute; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; height: 20px; }
        .fig .above { bottom: 100%; margin-bottom: 6px; }
        .fig .below { top: 100%; margin-top: 6px; }
        .fig button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 12px 12px 12px 0; }
        .fig button:active { opacity: 0.6; }
        .fig .lamp { width: 7px; height: 7px; background: currentColor; animation: lamp 1s steps(1) infinite; }
        @keyframes lamp { 50% { opacity: 0; } }
        .fig .read { position: absolute; left: calc(100% + 24px); bottom: 0; display: grid; grid-template-columns: auto auto; gap: 2px 16px;
          white-space: pre; font-variant-numeric: tabular-nums; }
        .fig .read span { text-align: right; }
        @media (max-width: 899px) {
          .fig .read { left: auto; right: 0; bottom: auto; top: calc(100% + 32px); }
        }
      `}</style>

      <figure className="fig" style={{ margin: 0 }}>
        <div className="line above">
          <span>VGF-8194</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clock ?? '--:--:--'}</span>
        </div>
        <canvas ref={plot} aria-hidden />
        <div className="line below">
          <button onClick={() => (live ? pause() : broadcastPlay())} aria-label={live ? 'Pause the station' : 'Play the station'}>
            <svg viewBox="0 0 8 9" fill="currentColor" aria-hidden width="8" height="9">
              {live ? <><rect x="0" y="0" width="2.5" height="9" /><rect x="5.5" y="0" width="2.5" height="9" /></>
                : <path d="M0 0 L8 4.5 L0 9 Z" />}
            </svg>
            {live ? 'ON AIR' : 'TEST'}
            {live && <i className="lamp" />}
          </button>
        </div>
        <div className="read">
          {rows.flatMap(([k, v]) => [<b key={k} style={{ fontWeight: 400 }}>{k}</b>, <span key={k + 'v'}>{v ?? '--'}</span>])}
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
