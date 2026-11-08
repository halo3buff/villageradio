'use client';

import { useEffect, useRef, useState } from 'react';
import { HomeDesktop } from '@/components/HomeDesktop';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PLATE_W = 345;   // the plate's width at zoom 1, px
const FILL = 0.84;     // of the frame's width the plate spans

/**
 * The recording view: the station's plate alone, centred and enlarged in a square or a 9:16
 * frame on the station's photo, for screen-recording to post. Everything outside the frame is
 * black; the frame choice sits above it, out of shot.
 */
export function RecFrame() {
  const [shape, setShape] = useState<'square' | 'vertical'>('square');
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setZoom((e.contentRect.width * FILL) / PLATE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pick = (s: typeof shape) => (
    <button onClick={() => setShape(s)} style={{ all: 'unset', cursor: 'pointer', opacity: shape === s ? 1 : 0.4 }}>
      {s.toUpperCase()}
    </button>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', color: '#fff', fontFamily: MONO, fontSize: 12,
      letterSpacing: '0.08em', display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '16px 24px 88px', gap: 14, boxSizing: 'border-box',
    }}>
      <style>{`
        .rec-frame { background: var(--vlg-cover, #a8a5a0); background-attachment: scroll; transform: translateZ(0); overflow: hidden; }
        .rec-frame.square { aspect-ratio: 1; height: min(100%, calc(100vw - 48px)); }
        .rec-frame.vertical { aspect-ratio: 9 / 16; height: min(100%, calc((100vw - 48px) * 16 / 9)); }
        /* the station, re-laid in the frame: its plate centred and enlarged, its corner links gone */
        .rec-frame > div { display: flex !important; padding: 0 !important; }
        .rec-frame .plate { position: relative; top: auto; left: auto; margin: auto; zoom: var(--rec-zoom); }
        .rec-frame a { display: none; }
      `}</style>
      <div style={{ display: 'flex', gap: 24 }}>{pick('square')}{pick('vertical')}</div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center' }}>
        <div ref={frame} className={`rec-frame ${shape}`} style={{ '--rec-zoom': zoom } as React.CSSProperties}>
          <HomeDesktop res={Math.ceil(zoom)} />
        </div>
      </div>
    </div>
  );
}
