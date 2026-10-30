'use client';

import Link from 'next/link';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PIXEL = "var(--font-vt323), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const DESKTOP = '#ffffff';
const LCD = '#3dff5a';    // a green phosphor LCD on black

/**
 * The station as a kiosk's green LCD in the top-left corner: the tree in an icon box at left, then
 * the clock over a rule, a selector with the state in brackets ([TEST] or [ON AIR]; tapping it
 * plays or pauses) and what's playing. README and RADAR top-right; the prompt is global (see
 * SiteFrame). The StationBar stays off here.
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
        .lcd { position: absolute; top: 72px; left: 24px; width: min(460px, calc(100vw - 48px)); background: #000;
          color: ${LCD}; font-family: ${PIXEL}; font-size: 26px; line-height: 1; padding: 8px 10px; display: flex; gap: 10px;
          text-shadow: 0 0 4px rgba(61,255,90,0.55); }
        /* the icon box: the tree, lit green through a mask, a bar down its right side */
        .lcd .icon { flex: none; width: 2.6em; border: 3px solid ${LCD}; border-radius: 6px; border-right-width: 7px;
          box-shadow: 0 0 4px rgba(61,255,90,0.45); display: grid; place-items: center; }
        .lcd .icon i { width: 82%; aspect-ratio: 1; background: ${LCD};
          -webkit-mask: url(/images/tree_8bit.png) center / 135% no-repeat; mask: url(/images/tree_8bit.png) center / 135% no-repeat; }
        .lcd .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .lcd .text > * { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lcd .head { border-bottom: 3px solid ${LCD}; padding-bottom: 3px; margin-bottom: 2px; }
        .lcd button { all: unset; cursor: pointer; }
        .lcd button:active { opacity: 0.7; }
        @media (max-width: 715px) {
          .lcd { top: 80px; font-size: 19px; padding: 6px 8px; gap: 8px; }
          .lcd .icon { border-width: 2px; border-right-width: 5px; }
        }
      `}</style>
      <div className="lcd">
        <div className="icon"><i role="img" aria-label="Village Radio" /></div>
        <div className="text">
          <div className="head">STATION {clock ?? '--:--:--'}:</div>
          <button onClick={() => (live ? pause() : broadcastPlay())} aria-label={live ? 'Pause the station' : 'Play the station'}>
            {live ? 'TEST,[ON AIR]' : '[TEST],ON AIR'}
          </button>
          <div>NOW:{track ? `${track.title} - ${track.artist}` : 'PRESS TO TUNE IN'}</div>
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
