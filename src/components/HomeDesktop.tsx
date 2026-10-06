'use client';

import Link from 'next/link';
import { AnalogueStrip } from '@/components/AnalogueStrip';

const SYS  = "'Geneva', Tahoma, 'MS Sans Serif', Verdana, sans-serif";

const INK = '#111';
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
        position: 'absolute', inset: 0, overflow: 'hidden',
        fontFamily: SYS, color: INK, background: DESKTOP,
      }}
    >
      {/* The radio itself — the analogue summary strip */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <AnalogueStrip />
      </div>

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
