'use client';

import Link from 'next/link';
import { AnalogueStrip } from '@/components/AnalogueStrip';

const SYS  = "'Geneva', Tahoma, 'MS Sans Serif', Verdana, sans-serif";

const INK = '#111';
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
        overflow: 'auto', overscrollBehavior: 'contain',
        fontFamily: SYS, color: INK, background: DESKTOP,
      }}
    >
      {/* The radio itself — the analogue summary strip */}
      {/* margin:auto centres the strip while it fits and lets it scroll once
          the stacked mobile layout is taller than the screen */}
      <div style={{
        minHeight: '100%', display: 'flex',
        padding: '36px 0 12px', boxSizing: 'border-box',
      }}>
        <div style={{ margin: 'auto', width: 'min(1122px, 100%)' }}>
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
          position: 'absolute', top: 14, right: 18, zIndex: 5,
          fontFamily: SYS, fontSize: 13, color: '#0000cc',
          textDecoration: 'underline', pointerEvents: 'auto',
        }}
      >
        README
      </Link>

    </div>
  );
}
