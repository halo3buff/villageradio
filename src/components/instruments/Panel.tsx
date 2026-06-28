'use client';

import type { ReactNode } from 'react';
import { MONO } from './retro';

/**
 * Bare instrument panel — no window chrome. The only separation between channels is a
 * thin gray hairline border; state is signalled by a small corner tag + status LED,
 * the way real rack equipment does, rather than a Windows title bar. `children` is a
 * render-prop receiving the exact pixel size of the interior so a canvas sizes 1:1.
 */

export type Led = 'live' | 'idle' | 'error';

const LED_COLOR: Record<Led, string> = {
  live: '#36e05a',   // green — signal present
  idle: '#d8a23a',   // amber — standby
  error: '#e0433a',  // red — fault
};

export function Panel({
  width, height, tag, led = 'idle', children,
}: {
  width: number;
  height: number;
  tag: string;
  led?: Led;
  children: (client: { w: number; h: number }) => ReactNode;
}) {
  const cw = width - 2;
  const ch = height - 2;
  return (
    <div style={{
      position: 'absolute', inset: 0, boxSizing: 'border-box',
      border: '1px solid #3a3a3a', background: '#000', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 1 }}>
        {children({ w: cw, h: ch })}
      </div>
      {/* corner designation tag + status LED — the only chrome */}
      <div style={{
        position: 'absolute', right: 4, bottom: 3, display: 'flex', alignItems: 'center', gap: 5,
        pointerEvents: 'none', zIndex: 2,
      }}>
        <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.14em', color: 'rgba(200,200,200,0.5)' }}>{tag}</span>
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: LED_COLOR[led],
          boxShadow: `0 0 4px ${LED_COLOR[led]}`,
          animation: led === 'live' ? 'vrPulse 1.6s ease-in-out infinite' : undefined,
        }} />
      </div>
    </div>
  );
}
