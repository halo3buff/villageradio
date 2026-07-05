'use client';

import { useEffect, useState } from 'react';

export const STAGE_W = 402;
export const STAGE_H = 874;

/** `${n}px` for coordinates in the 402×874 mobile design frame. */
export const px = (n: number) => `${n}px`;

/**
 * The 402×874 mobile design frame, uniformly scaled (one factor for both axes) to
 * fit the visual viewport and centered. Children position with `px()` design pixels,
 * so the composition always keeps the exact Figma proportions — unlike the previous
 * vw/dvh sizing, which stretched each axis independently and resized with iOS
 * Safari's collapsing URL bar.
 */
export function MobileStage({ zIndex, children }: { zIndex?: number; children: React.ReactNode }) {
  const [box, setBox] = useState({ scale: 1, left: 0, top: 0 });

  useEffect(() => {
    const update = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const scale = Math.min(vw / STAGE_W, vh / STAGE_H);
      setBox({
        scale,
        left: (vw - STAGE_W * scale) / 2,
        top: (vh - STAGE_H * scale) / 2,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  return (
    <main style={{ position: 'fixed', inset: 0, zIndex, overflow: 'hidden', background: '#fff' }}>
      <div
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${box.scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </main>
  );
}
