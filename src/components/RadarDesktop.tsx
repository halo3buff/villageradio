'use client';

import { BackLink } from '@/components/BackLink';
import { RadarScope } from '@/components/RadarScope';
import type { RadarFeed } from '@/lib/radar';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the global command prompt's strip, as on the station

/** The radar page: the scope centred above the prompt, BACK where the station keeps README. */
export function RadarDesktop({ feed }: { feed: RadarFeed | null }) {
  return (
    <div style={{
      position: 'fixed', inset: `0 0 ${PROMPT_BAND}px 0`, display: 'flex',
      background: 'var(--vlg-bg, #fff)', overflow: 'hidden',
    }}>
      {/* 372 × 446 plate units (see RadarScope) */}
      <div style={{ width: 'min(calc(100% - 16px), calc((100dvh - 100px) * 372 / 446), 560px)', margin: 'auto' }}>
        <RadarScope feed={feed} />
      </div>
      <BackLink href="/station" style={{
        position: 'absolute', top: 24, right: 24, zIndex: 5,
        fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em',
        color: 'var(--vlg-fg, #000)', textDecoration: 'none',
      }}>
        BACK
      </BackLink>
    </div>
  );
}
