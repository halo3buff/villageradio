'use client';

import Link from 'next/link';
import { AnalogueStrip, type Metrics } from '@/components/AnalogueStrip';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const INK = 'var(--vlg-fg, #111)';
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const DESKTOP = 'var(--vlg-bg, #fff)';
// the readout's highlighter pens, see-through so they read on any theme
const LAV = '#efe8f9', MINT = '#cdfbe9';   // the reference's pens, washed out

const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '--.-');
const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '-.--');

type Read = { mom: number; integ: number; tp: number; corr: number; live: boolean };

/**
 * The station, laid out as a system monitor's readout: the clock as its headline, the Lissajous
 * square at left with a rule beside it, and at right the programme (what's playing) and the
 * signal (loudness, stereo), highlighted as a printout marked up by pen; ON AIR or TEST last.
 * README and RADAR top-right; the prompt is global (see SiteFrame), the transport the StationBar.
 */
export function HomeDesktop() {
  const { currentTrack } = useAudio();
  const [clock, setClock] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const latest = useRef<Metrics | null>(null);

  // the body's min-h-screen is iOS's LARGE viewport, taller than what's visible with the URL bar
  // up: drop it while the station is up, so the page has nothing to scroll (as HomeTemp does)
  useEffect(() => {
    const body = document.body;
    const prev = body.style.minHeight;
    body.style.minHeight = '0';
    return () => { body.style.minHeight = prev; };
  }, []);

  // the clock and the readout four times a second, the readout off the scope's latest frame
  useEffect(() => {
    const tick = () => {
      setClock(stationClock());
      const m = latest.current;
      if (m) setRead({ mom: m.mom, integ: m.integ, tp: Math.max(m.tpL, m.tpR), corr: m.corr, live: m.live });
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, []);

  const r = read;
  const corr = r?.corr ?? NaN;
  const width = Number.isFinite(corr) ? Math.round((1 - corr) * 50) : '--';
  const phase = Number.isFinite(corr) ? Math.round(Math.acos(Math.max(-1, Math.min(1, corr))) * 57.2958) : '--';
  const status = r?.live ? (r.tp > -1 ? 'HOT' : 'ON AIR') : 'TEST';
  const track = currentTrack;

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', top: 0, left: 0, right: 0, bottom: PROMPT_BAND,
      overflow: 'hidden', overscrollBehavior: 'contain',
      fontFamily: MONO, color: INK, background: DESKTOP,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <style>{`
        .monitor { display: flex; flex-direction: column; gap: 18px; padding: 72px 16px 16px; max-width: 100%; }
        .monitor .hl { background: ${LAV}; padding: 1px 5px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
        .monitor .mint { background: ${MINT}; }
        /* the reference's proportions: the square about as tall as the readout, the headline ~1.4x its text */
        .monitor { --sq: 184px; }
        .monitor .head { font-size: 19px; letter-spacing: 0.04em; white-space: nowrap; }
        .monitor .row { display: flex; gap: 18px; align-items: flex-start; }
        .monitor .scope { width: var(--sq); flex: none; }
        .monitor .rule { width: 9px; height: var(--sq); background: ${MINT}; flex: none; margin-left: -12px; }
        /* a fixed width, so changing readouts never re-centre the whole monitor */
        .monitor .info { display: flex; flex-direction: column; gap: 6px; font-size: 13px; line-height: 1.55; letter-spacing: 0.03em; flex: none; width: 46ch; max-width: 100%; }
        .monitor .info .gap { height: 10px; }
        /* phones: the square on top, its rule under it, the readout below */
        @media (max-width: 715px) {
          .monitor { gap: 14px; padding-top: 64px; --sq: min(56vw, 220px); }
          .monitor .head { font-size: 16px; }
          .monitor .row { flex-direction: column; gap: 10px; }
          .monitor .scope, .monitor .rule { width: var(--sq); }
          .monitor .rule { height: 6px; margin: -4px 0 0; }
          .monitor .info { font-size: 12px; gap: 4px; }
        }
      `}</style>
      <div className="monitor">
        <div className="head"><span className="hl">STATION: {clock ?? '--:--:--'} ET</span></div>
        <div className="row">
          <div className="scope">
            <AnalogueStrip scope onMetrics={(m) => { latest.current = m; }} />
          </div>
          <div className="rule" aria-hidden />
          <div className="info">
            <div><span className="hl">NOW PLAYING: {track ? track.title : '--'}</span></div>
            <div>{track ? `${track.artist}, ${track.kind === 'inter' ? 'BREAK' : 'MIX'}` : 'PRESS ▶ TO TUNE IN'}</div>
            <div className="gap" />
            <div><span className="hl">RUNTIME: {track?.duration || '--:--'}{track?.date ? `, ${track.date}` : ''}</span></div>
            <div><span className="hl mint">LOUDNESS: {f1(r?.mom ?? NaN)} LUFS, {f1(r?.integ ?? NaN)} INT, {f1(r?.tp ?? NaN)} TP</span></div>
            <div>STEREO: {width}% WIDTH, r {f2(corr)}, {phase}° PHASE</div>
            <div className="gap" />
            <div><span className={r?.live ? 'hl mint' : 'hl'}>{status}</span></div>
          </div>
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
