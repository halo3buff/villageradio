'use client';

import Link from 'next/link';
import Image from 'next/image';
import { AnalogueStrip, type Metrics } from '@/components/AnalogueStrip';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
// the Sapporo '72 poster's three inks, sampled
const BLUE = '#0160ac', WHITE = '#fbfcfe', RED = '#c20408';

const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '--.-');

type Read = { mom: number; tp: number; corr: number };

/**
 * The station as a poster, after Sapporo '72: on blue, the clock as its title, then two stacked
 * squares in one white frame: the Lissajous on white (where the poster's sun is), the tree on blue
 * (where its snowflake is). The transport and ON AIR / TEST sit in the scope's top-left corner,
 * a line of metrics and what's playing under the frame. README and RADAR top-right.
 */
export function HomeDesktop() {
  const { currentTrack, isPlaying, mode, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const [clock, setClock] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const latest = useRef<Metrics | null>(null);

  // the body's min-h-screen is iOS's LARGE viewport, taller than what's visible with the URL bar
  // up: drop it while the station is up, so the page has nothing to scroll (as HomeTemp does).
  // And the page's ink goes white on the poster's blue, the global prompt with it.
  useEffect(() => {
    const body = document.body;
    const prev = [body.style.minHeight, body.style.background];
    body.style.minHeight = '0';
    body.style.background = BLUE;
    body.style.setProperty('--vlg-fg', WHITE);
    return () => {
      [body.style.minHeight, body.style.background] = prev;
      body.style.removeProperty('--vlg-fg');
    };
  }, []);

  // the clock and the readout four times a second, the readout off the scope's latest frame
  useEffect(() => {
    const tick = () => {
      setClock(stationClock());
      const m = latest.current;
      if (m) setRead({ mom: m.mom, tp: Math.max(m.tpL, m.tpR), corr: m.corr });
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, []);

  const corr = read?.corr ?? NaN;
  const width = Number.isFinite(corr) ? Math.round((1 - corr) * 50) : '--';

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', inset: 0, paddingBottom: PROMPT_BAND,
      overflow: 'hidden', overscrollBehavior: 'contain',
      background: BLUE, color: WHITE, fontFamily: MONO,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <style>{`
        /* one square's side: two of them, the title and the metrics fit the visible height */
        .poster { --sq: min(78vw, 320px, calc((100dvh - ${PROMPT_BAND + 130}px) / 2.25)); width: var(--sq);
          display: flex; flex-direction: column; align-items: stretch; }
        .poster .title { font-family: ${SANS}; font-weight: 700; font-size: calc(var(--sq) * 0.19); line-height: 1;
          text-align: center; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; margin-bottom: calc(var(--sq) * 0.06); white-space: nowrap; }
        .poster .title sup { font-size: 0.42em; vertical-align: 0.95em; margin-left: 0.08em; }
        .poster .frame { border: calc(var(--sq) * 0.035) solid ${WHITE}; background: ${WHITE}; }
        .poster .sun { position: relative; background: ${WHITE}; }
        .poster .snow { position: relative; aspect-ratio: 1; background: ${BLUE}; }
        .poster .ctl { position: absolute; top: 6px; left: 6px; display: flex; align-items: center; gap: 6px;
          color: ${BLUE}; font-size: 10px; letter-spacing: 0.08em; font-weight: 700; }
        .poster .ctl button { display: grid; place-items: center; width: 20px; height: 20px; border: 1px solid currentColor; }
        .poster .ctl button:active { transform: scale(0.94); }
        .poster .meta { margin-top: calc(var(--sq) * 0.07); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .poster .meta .small { font-size: 10px; letter-spacing: 0.08em; }
        .poster .meta .big { font-family: ${SANS}; font-weight: 700; font-size: calc(var(--sq) * 0.075); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
      <div className="poster">
        <div className="title">{clock ?? '--:--:--'}<sup>ET</sup></div>
        <div className="frame">
          <div className="sun">
            <AnalogueStrip scope onMetrics={(m) => { latest.current = m; }} />
            <div className="ctl">
              <button onClick={() => (live ? pause() : broadcastPlay())} aria-label={live ? 'Pause the station' : 'Play the station'}>
                <svg viewBox="0 0 8 9" fill="currentColor" aria-hidden width={8} height={9}>
                  {live ? <><rect x="0" y="0" width="2.5" height="9" /><rect x="5.5" y="0" width="2.5" height="9" /></> : <path d="M0 0 L8 4.5 L0 9 Z" />}
                </svg>
              </button>
              <span style={{ color: live ? RED : BLUE }}>{live ? 'ON AIR' : 'TEST'}</span>
            </div>
          </div>
          <div className="snow">
            <Image src="/images/tree_8bit.png" alt="Village Radio" fill sizes="320px"
              style={{ objectFit: 'contain', padding: '14%', filter: 'brightness(0) invert(1)' }} />
          </div>
        </div>
        <div className="meta">
          <div className="small">{f1(read?.mom ?? NaN)} LUFS · TP {f1(read?.tp ?? NaN)} · WIDTH {width}%</div>
          <div className="big">{currentTrack ? currentTrack.title : 'VILLAGE RADIO'}</div>
        </div>
      </div>

      {/* README and RADAR — top-right corner */}
      <Link href="/station/readme" style={{ position: 'absolute', top: 24, right: 24, zIndex: 5, fontSize: 12, letterSpacing: '0.08em', color: WHITE, textDecoration: 'none' }}>
        README
      </Link>
      <Link href="/station/radar" style={{ position: 'absolute', top: 44, right: 24, zIndex: 5, fontSize: 12, letterSpacing: '0.08em', color: WHITE, textDecoration: 'none' }}>
        RADAR
      </Link>
    </div>
  );
}
