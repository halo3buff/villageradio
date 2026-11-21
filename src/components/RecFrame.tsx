'use client';

import { useEffect, useState } from 'react';
import { SoundRing } from '@/components/SoundRing';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const HIDE_MS = 2000;  // the frame choice fades out of shot after this

/**
 * The recording view: the station's mark in a ring of sound, for screen-recording to post. VERTICAL
 * fills the whole screen; SQUARE is the screen's width, centred on black, to crop to. The choice
 * shows for a moment, then leaves the shot; a tap brings it back (and tunes in or out).
 */
export function RecFrame() {
  const [shape, setShape] = useState<'square' | 'vertical'>('vertical');
  const [shown, setShown] = useState(true);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), HIDE_MS);
    return () => clearTimeout(t);
  }, [shown, shape]);

  const pick = (s: typeof shape) => (
    <button onClick={() => setShape(s)} style={{ all: 'unset', cursor: 'pointer', padding: 8, opacity: shape === s ? 1 : 0.45 }}>
      {s.toUpperCase()}
    </button>
  );

  return (
    <div onClick={() => setShown(true)}
      style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={shape === 'vertical' ? { width: '100%', height: '100%' } : { width: 'min(100vw, 100dvh)', aspectRatio: '1' }}>
        <SoundRing />
      </div>
      <div style={{
        position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', left: 0, right: 0, zIndex: 10,
        display: 'flex', justifyContent: 'center', gap: 16, color: '#fff', fontFamily: MONO, fontSize: 12,
        letterSpacing: '0.08em', opacity: shown ? 1 : 0, pointerEvents: shown ? 'auto' : 'none', transition: 'opacity 300ms',
      }}>
        {pick('square')}{pick('vertical')}
      </div>
    </div>
  );
}
