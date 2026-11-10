'use client';

import { useEffect, useRef, useState } from 'react';
import { HomeDesktop } from '@/components/HomeDesktop';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PLATE_W = 345;   // the plate's width at zoom 1, px
const FILL = 0.84;     // of the frame's width the plate spans
const HIDE_MS = 2000;  // the frame choice fades out of shot after this

/**
 * The recording view: the station's plate alone, centred and enlarged on the station's photo, for
 * screen-recording to post. VERTICAL fills the whole screen; SQUARE is the screen's width, centred
 * on black, to crop to. The choice shows for a moment, then leaves the shot; tap off the plate to
 * bring it back.
 */
export function RecFrame() {
  const [shape, setShape] = useState<'square' | 'vertical'>('vertical');
  const [shown, setShown] = useState(true);
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setZoom((e.contentRect.width * FILL) / PLATE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    <div
      onClick={(e) => { if (!(e.target as HTMLElement).closest('.plate')) setShown(true); }}
      style={{ position: 'fixed', inset: 0, background: shape === 'vertical' ? 'var(--vlg-cover, #000)' : '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{`
        .rec-frame { position: relative; background: var(--vlg-cover, #a8a5a0); background-attachment: scroll; transform: translateZ(0); overflow: hidden; }
        .rec-frame.vertical { width: 100%; height: 100%; }
        .rec-frame.square { width: min(100vw, 100dvh); aspect-ratio: 1; }
        /* the station, re-laid in the frame: its plate centred and enlarged, its corner links gone */
        .rec-frame > div { display: flex !important; padding: 0 !important; inset: 0 !important; }
        .rec-frame .plate { position: relative; top: auto; left: auto; margin: auto; zoom: var(--rec-zoom); }
        .rec-frame a { display: none; }
      `}</style>
      <div ref={frame} className={`rec-frame ${shape}`} style={{ '--rec-zoom': zoom } as React.CSSProperties}>
        <HomeDesktop res={Math.ceil(zoom)} />
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
