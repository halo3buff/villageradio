'use client';

import Link from 'next/link';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const DESKTOP = '#ffffff';
// a workstation's boot screen: a tall serif masthead over typewriter lines
const SERIF = "'Times New Roman', Times, serif";
const TYPE = "'Courier New', Courier, monospace";

/**
 * The station as an old workstation's boot screen in the top-left corner: the masthead, then the
 * play/pause where a copyright mark would be, the clock and what's playing, the on-air state and a
 * blinking cursor. README and RADAR top-right; the prompt is global (see SiteFrame). The
 * StationBar stays off here.
 */
export function HomeDesktop() {
  const { currentTrack: track, isPlaying, mode, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const [clock, setClock] = useState<string | null>(null);

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
    const tick = () => setClock(stationClock());
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
        .boot { position: absolute; top: 72px; left: 24px; right: 24px; font-family: ${TYPE}; font-size: 16px; line-height: 1.25; }
        /* the masthead: a plain serif drawn tall and narrow */
        .boot h1 { font-family: ${SERIF}; font-weight: 400; font-size: 64px; line-height: 1; letter-spacing: -0.03em;
          transform: scaleY(1.45); transform-origin: left bottom; margin: 0 0 18px; white-space: nowrap; }
        .boot .row { display: grid; grid-template-columns: 4ch 1fr; }
        .boot .row > :last-child, .boot .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .boot button { justify-self: start; align-self: center; display: grid; place-items: center;
          width: 3ch; height: 1.05em; border: 1.5px solid currentColor; border-radius: 999px; }
        .boot button:active { transform: scale(0.94); }
        .boot .cursor { display: inline-block; width: 0.6em; height: 1.05em; background: currentColor; animation: boot-blink 1s steps(1) infinite; }
        @keyframes boot-blink { 50% { opacity: 0; } }
        @media (max-width: 715px) {
          .boot { top: 80px; font-size: 12px; }
          .boot h1 { font-size: 44px; margin-bottom: 14px; }
        }
      `}</style>
      <div className="boot">
        <h1>VLGR-88000</h1>
        <div className="row">
          <button onClick={() => (live ? pause() : broadcastPlay())} aria-label={live ? 'Pause the station' : 'Play the station'}>
            <svg viewBox="0 0 8 9" fill="currentColor" aria-hidden width="0.5em" height="0.55em">
              {live ? <><rect x="0" y="0" width="2.5" height="9" /><rect x="5.5" y="0" width="2.5" height="9" /></> : <path d="M0 0 L8 4.5 L0 9 Z" />}
            </svg>
          </button>
          <span>Village Radio, station time {clock ?? '--:--:--'} ET</span>
        </div>
        <div className="row"><span /><span>Now playing: {track ? `${track.title}, ${track.artist}` : 'nothing loaded'}</span></div>
        <div className="row"><span /><span>Runtime: {track ? `${track.duration || '--:--'}, ${track.kind === 'inter' ? 'break' : 'mix'}` : '--:--'}</span></div>
        <div className="line">{live ? 'Auto-tuning... LIVE, ON AIR' : 'Standing by... OFF AIR'}</div>
        <div className="line">{live ? 'Broadcasting vlg(0,1,0) live' : 'Press play to tune in'}</div>
        <span className="cursor" aria-hidden />
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
