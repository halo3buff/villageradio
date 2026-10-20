'use client';

import Link from 'next/link';
import { AnalogueStrip } from '@/components/AnalogueStrip';
import { STACK_MIN_H } from '@/components/stationPlate';
import { DOTS_SPAN } from '@/components/StationBar';
import { useEffect, useRef } from 'react';

const SYS  = "'Geneva', Tahoma, 'MS Sans Serif', Verdana, sans-serif";
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

const INK = 'var(--vlg-fg, #111)';
// The command prompt is fixed at bottom-left (24px up, 40px tall). The station
// scrolls INSIDE the space above it, so nothing ever slides underneath.
const PROMPT_BAND = 72;
const PAD_TOP = 16, PAD_BOTTOM = 12;
const DESKTOP = 'var(--vlg-bg, #fff)';   // same ground as the blocker screen

/**
 * Desktop homepage — a super-outdated early-2000s Mac desktop. A small classic
 * Mac window sits centred, holding the dot-matrix LCD broadcast. LIVE tag above
 * it, PLAY/STOP below, README top-right.
 * The command prompt is global — see SiteFrame.
 */
export function HomeDesktop() {
  const outerRef = useRef<HTMLDivElement>(null);
  // the body's min-h-screen is iOS's LARGE viewport, taller than what's
  // visible with the URL bar up: drop it while the station is up, so the
  // page has nothing to scroll (as HomeTemp does)
  useEffect(() => {
    const body = document.body;
    const prev = body.style.minHeight;
    body.style.minHeight = '0';
    return () => { body.style.minHeight = prev; };
  }, []);

  return (
    <div
      ref={outerRef}
      style={{
        // fixed, so on iOS it tracks the visible viewport, not the large one
        position: 'fixed', top: 0, left: 0, right: 0, bottom: PROMPT_BAND,
        overflow: 'hidden', overscrollBehavior: 'contain',
        fontFamily: SYS, color: INK, background: DESKTOP,
      }}
    >
      {/* The radio itself — the analogue summary strip */}
      {/* The station's width. Below 716px it's the phone stack, whose screen
          stretches to fill the height given by fitHeight (see stationPlate);
          this cap only bites on phones too short for even its smallest
          screen. The page never scrolls. margin:auto centres it. */}
      <style>{`
        .station-fit { width: min(calc(100% - 16px), calc((100dvh - ${PROMPT_BAND + PAD_TOP + PAD_BOTTOM}px) * 372 / ${STACK_MIN_H})); margin: auto; }
        /* desktop: hung straight under the StationBar, the Lissajous (plate x 22..339 of 372)
           spanning the bar from its far-left dots to its far-right ones */
        @media (min-width: 716px) {
          .station-fit { width: ${Math.round((DOTS_SPAN * 372) / 317)}px; margin: -${PAD_TOP}px auto 0; translate: ${(5.5 / 372) * 100}% 0; }
        }
      `}</style>
      <div style={{
        minHeight: '100%', display: 'flex',
        padding: `${PAD_TOP}px 0 ${PAD_BOTTOM}px`, boxSizing: 'border-box',
      }}>
        <div className="station-fit">
          <AnalogueStrip fitHeight={() => (outerRef.current?.clientHeight ?? 0) - PAD_TOP - PAD_BOTTOM} />
        </div>
      </div>

      {/* the prompt's band, painted so the page reads as one surface */}
      <div aria-hidden style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, height: PROMPT_BAND,
        background: DESKTOP, zIndex: 4, pointerEvents: 'none',
      }} />

      {/* README — top-right corner */}
      <Link
        href="/information"
        style={{
          position: 'absolute', top: 24, right: 24, zIndex: 5,
          fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em',
          color: 'var(--vlg-fg, #000)', textDecoration: 'none',
          pointerEvents: 'auto',
        }}
      >
        README
      </Link>

    </div>
  );
}
