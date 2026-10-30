'use client';

import Link from 'next/link';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const DESKTOP = '#ffffff';
const FRAME = '#7fb2e5';   // the header's hairline, a selection box's light blue

// the spectrum's axes: linear 0..6.2 kHz, -110..-15 dB, as a phone analyser app draws them
const F_MAX = 6200, DB_LO = -110, DB_HI = -15;

const stationDate = () => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York', day: '2-digit', month: '2-digit', year: '2-digit',
}).format(new Date()).replace(/\//g, '.');

/** The live spectrum: a yellow dashed trace over a red dotted peak hold, on a dark grid. */
function Spectrum() {
  const { analyserFreq } = useAudio();
  const ref = useRef<HTMLCanvasElement>(null);
  const an = useRef(analyserFreq);
  an.current = analyserFreq;

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0, buf = new Float32Array(0), peak = new Float32Array(0);
    const loop = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const L = 30, B = H - 14, T = 6;   // plot box: left gutter for dB, bottom for Hz
      const x = (f: number) => L + (f / F_MAX) * (W - L);
      const y = (db: number) => T + ((DB_HI - Math.max(DB_LO, Math.min(DB_HI, db))) / (DB_HI - DB_LO)) * (B - T);
      // the grid: every 500 Hz, every 12.5 dB; the labelled lines a touch brighter
      ctx.lineWidth = 1; ctx.font = `10px ${MONO}`; ctx.textBaseline = 'middle';
      for (let f = 0; f <= F_MAX; f += 500) {
        ctx.strokeStyle = f % 1000 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.moveTo(Math.round(x(f)) + 0.5, T); ctx.lineTo(Math.round(x(f)) + 0.5, B); ctx.stroke();
        if (f % 1000 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'center'; ctx.fillText(String(f), Math.min(x(f), W - 14), H - 6); }
      }
      for (let db = -100; db <= -25; db += 12.5) {
        ctx.strokeStyle = db % 25 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.moveTo(L, Math.round(y(db)) + 0.5); ctx.lineTo(W, Math.round(y(db)) + 0.5); ctx.stroke();
        if (db % 25 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'right'; ctx.fillText(String(db), L - 4, y(db)); }
      }
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText('dB', 3, T + 4);

      const a = an.current;
      if (a) {
        if (buf.length !== a.frequencyBinCount) { buf = new Float32Array(a.frequencyBinCount); peak = new Float32Array(a.frequencyBinCount).fill(DB_LO); }
        a.getFloatFrequencyData(buf);
        const hz = a.context.sampleRate / a.fftSize, n = Math.min(buf.length, Math.ceil(F_MAX / hz));
        // the peak hold falls back slowly, so it reads as the recent envelope
        for (let i = 0; i < n; i++) peak[i] = Math.max(Number.isFinite(buf[i]) ? buf[i] : DB_LO, peak[i] - 0.15);
        const trace = (d: Float32Array, color: string, dash: number[], w: number) => {
          ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash);
          ctx.beginPath();
          for (let i = 1; i < n; i++) { const v = Number.isFinite(d[i]) ? d[i] : DB_LO; if (i === 1) ctx.moveTo(x(i * hz), y(v)); else ctx.lineTo(x(i * hz), y(v)); }
          ctx.stroke(); ctx.setLineDash([]);
        };
        trace(peak, '#c0392b', [1.5, 1.5], 1.2);
        trace(buf, '#f2d14b', [3, 2], 1.2);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} aria-hidden style={{ display: 'block', width: '100%', aspectRatio: '10 / 3' }} />;
}

/**
 * The station as a studio's header card over a spectrum analyser, in the top-left corner: the
 * name and the play/pause with ON AIR / TEST at left, what's playing in the middle, the station's
 * date and clock bottom-right; the live spectrum under it at the same width. README and RADAR
 * top-right; the prompt is global (see SiteFrame). The StationBar stays off here.
 */
export function HomeDesktop() {
  const { currentTrack: track, isPlaying, mode, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const [clock, setClock] = useState<string | null>(null);
  const [date, setDate] = useState('--.--.--');

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
    const tick = () => { setClock(stationClock()); setDate(stationDate()); };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', inset: 0, paddingBottom: PROMPT_BAND,
      overflow: 'hidden', overscrollBehavior: 'contain',
      fontFamily: MONO, color: '#111', background: DESKTOP,
    }}>
      <style>{`
        .card { position: absolute; top: 72px; left: 24px; width: min(460px, calc(100vw - 48px)); display: flex; flex-direction: column; gap: 8px; }
        .card .head { border: 1px solid ${FRAME}; padding: 4px 6px 5px; font-size: 12px; line-height: 1.1; text-transform: uppercase;
          display: grid; grid-template-columns: 15ch 1fr auto; column-gap: 6px; }
        .card .what { grid-column: 2 / 4; min-height: 3.3em; }
        .card .on { display: flex; align-items: center; gap: 5px; }
        .card .on button { display: grid; place-items: center; width: 1.1em; height: 1.1em; border: 1px solid currentColor; }
        .card .on button:active { transform: scale(0.94); }
        .card .when { grid-column: 3; text-align: right; white-space: nowrap; }
        @media (max-width: 715px) {
          .card { top: 80px; }
          .card .head { font-size: 10.5px; grid-template-columns: 14ch 1fr auto; }
        }
      `}</style>
      <div className="card">
        <div className="head">
          <span>VILLAGE RADIO</span>
          <span className="what">
            {track
              ? <>NOW PLAYING.<br />{track.title} - {track.artist} / {track.kind === 'inter' ? 'BREAK' : 'MIX'}{track.duration ? ` / ${track.duration}` : ''}</>
              : <>ID VLGR.<br />INDEPENDENT BROADCAST - NOTHING PLAYING / PRESS PLAY TO TUNE IN</>}
          </span>
          <span className="on">
            <button onClick={() => (live ? pause() : broadcastPlay())} aria-label={live ? 'Pause the station' : 'Play the station'}>
              <svg viewBox="0 0 8 9" fill="currentColor" aria-hidden width="0.5em" height="0.55em">
                {live ? <><rect x="0" y="0" width="2.5" height="9" /><rect x="5.5" y="0" width="2.5" height="9" /></> : <path d="M0 0 L8 4.5 L0 9 Z" />}
              </svg>
            </button>
            {live ? 'ON AIR' : 'TEST'}
          </span>
          <span className="when">{date}  {clock ?? '--:--:--'} ET</span>
        </div>
        <Spectrum />
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
