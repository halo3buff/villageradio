'use client';

import Link from 'next/link';
import { AnalogueStrip, type Metrics } from '@/components/AnalogueStrip';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useRef, useState } from 'react';
import { Share_Tech_Mono } from 'next/font/google';

// the label's type: a squared technical mono, as on the reference spec plate
const plate = Share_Tech_Mono({ weight: '400', subsets: ['latin'] });

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const INK = 'var(--vlg-fg, #111)';
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const DESKTOP = '#ffffff';
const RULE = '#8a8a8a';   // the label's outline and rules: grey, plain on the white
const pick = (set: string, n: number) => Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('');

const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '--.-');

type Read = { mom: number; integ: number; tp: number; corr: number; live: boolean };

/**
 * The station as a spec label in the top-left corner: the Lissajous square, a spine with
 * a serial, then the clock with play/pause and ON AIR / TEST, what's playing and the loudness.
 * README and RADAR top-right; the prompt is global (see SiteFrame). The StationBar stays off here.
 */
export function HomeDesktop() {
  const { currentTrack, isPlaying, mode, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  // the spine's serial, like a spec plate's: fresh each visit (client only, so no hydration clash)
  const [serial, setSerial] = useState('----');
  useEffect(() => {
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    setSerial(`${pick(L, 4)}-${pick(L, 1)}-${pick('0123456789', 2)}`);
  }, []);
  const [clock, setClock] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const latest = useRef<Metrics | null>(null);

  // the body's min-h-screen is iOS's LARGE viewport, taller than what's visible with the URL bar
  // up: drop it while the station is up, so the page has nothing to scroll (as HomeTemp does)
  useEffect(() => {
    const body = document.body;
    const prev = [body.style.minHeight, body.style.background];
    body.style.minHeight = '0';
    body.style.background = DESKTOP;   // white under the prompt band too
    return () => { [body.style.minHeight, body.style.background] = prev; };
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
  const status = r?.live ? (r.tp > -1 ? 'HOT' : 'ON AIR') : 'TEST';
  const track = currentTrack;

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', inset: 0, paddingBottom: PROMPT_BAND,
      overflow: 'hidden', overscrollBehavior: 'contain',
      fontFamily: MONO, color: INK, background: DESKTOP,
    }}>
      <style>{`
        /* a label, as on a rack's spec plate: the scope, a spine with a serial set sideways,
           then the clock and transport over a dotted rule and three lines; a grey outline round it all */
        .tag { --sq: 128px; position: absolute; top: 72px; left: 24px; display: flex; height: var(--sq);
          border: 2px solid ${RULE}; overflow: hidden; color: #111;
          font-size: 18px; line-height: 1.12; text-transform: uppercase; }
        .tag > * + * { border-left: 1.5px solid ${RULE}; }
        .tag .scope { width: var(--sq); flex: none; }
        .tag .spine { flex: none; display: grid; place-items: center; padding: 0 4px;
          writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: 0.06em; white-space: nowrap; }
        /* a fixed width, so changing readouts never shift the label */
        .tag .body { flex: none; width: calc(30ch + 16px); display: flex; flex-direction: column; padding: 7px 8px 8px; }
        .tag .body > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tag .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .tag .on { display: flex; align-items: center; gap: 6px; flex: none; }
        .tag .on button { display: grid; place-items: center; width: 1em; height: 1em; border: 1.5px solid currentColor; }
        .tag .on button:active { transform: scale(0.94); }
        .tag .dots { border-top: 1.5px dotted ${RULE}; margin: 9px -8px auto; }
        @media (max-width: 715px) {
          .tag { --sq: 92px; top: 80px; font-size: 13px; max-width: calc(100vw - 48px); }
          .tag .spine { padding: 0 3px; }
          .tag .body { width: auto; flex: 1; min-width: 0; padding: 5px 6px 6px; }
          .tag .dots { margin: 6px -6px auto; }
        }
      `}</style>
      <div className={`tag ${plate.className}`}>
        <div className="scope">
          <AnalogueStrip scope onMetrics={(m) => { latest.current = m; }} />
        </div>
        <div className="spine">{serial}</div>
        <div className="body">
          <div className="top">
            <span>STATION {clock ?? '--:--:--'} ET</span>
            <span className="on">
              <button onClick={() => (live ? pause() : broadcastPlay())} aria-label={live ? 'Pause the station' : 'Play the station'}>
                <svg viewBox="0 0 8 9" fill="currentColor" aria-hidden width="0.45em" height="0.5em">
                  {live ? <><rect x="0" y="0" width="2.5" height="9" /><rect x="5.5" y="0" width="2.5" height="9" /></> : <path d="M0 0 L8 4.5 L0 9 Z" />}
                </svg>
              </button>
              {status}
            </span>
          </div>
          <div className="dots" aria-hidden />
          <div>{track ? track.title : 'PRESS ▶ TO TUNE IN'}</div>
          <div>{track ? `${track.artist} · ${track.kind === 'inter' ? 'BREAK' : 'MIX'} · ${track.duration || '--:--'}` : 'NOTHING PLAYING'}</div>
          <div>{f1(r?.mom ?? NaN)} LUFS · TP {f1(r?.tp ?? NaN)}  · W {width}%</div>
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
