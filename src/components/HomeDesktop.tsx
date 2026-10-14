'use client';

import Link from 'next/link';
import { AnalogueStrip } from '@/components/AnalogueStrip';
import { plateDims } from '@/components/stationPlate';

const TALL = plateDims(true);

const SYS  = "'Geneva', Tahoma, 'MS Sans Serif', Verdana, sans-serif";
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

const INK = 'var(--vlg-fg, #111)';
// The command prompt is fixed at bottom-left (24px up, 40px tall). The station
// scrolls INSIDE the space above it, so nothing ever slides underneath.
const PROMPT_BAND = 72;
const DESKTOP = 'var(--vlg-bg, #fff)';   // same ground as the blocker screen

/**
 * Desktop homepage — a super-outdated early-2000s Mac desktop. A small classic
 * Mac window sits centred, holding the dot-matrix LCD broadcast. LIVE tag above
 * it, PLAY/STOP below, README top-right.
 * The command prompt is global — see SiteFrame.
 */
export function HomeDesktop() {
  return (
    <div
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: PROMPT_BAND,
        overflow: 'hidden', overscrollBehavior: 'contain',
        fontFamily: SYS, color: INK, background: DESKTOP,
      }}
    >
      {/* The radio itself — the analogue summary strip */}
      {/* The station's width. Below 716px it's the phone stack (see
          stationPlate), sized so its whole height fits
          between the top padding (36 + 12) and the prompt band: the page
          never scrolls. margin:auto centres it. */}
      <style>{`
        .station-fit { width: min(1160px, calc(100% - 16px)); }
        @media (max-width: 715px) {
          .station-fit { width: min(calc(100% - 16px), calc((100dvh - ${PROMPT_BAND + 48}px) * ${TALL.w} / ${TALL.h})); }
        }
      `}</style>
      <div style={{
        minHeight: '100%', display: 'flex',
        padding: '36px 0 12px', boxSizing: 'border-box',
      }}>
        <div className="station-fit" style={{ margin: 'auto' }}>
          <AnalogueStrip />
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
