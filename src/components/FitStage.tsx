'use client';

import { useEffect, useState } from 'react';

export const STAGE_W = 1440;
export const STAGE_H = 1024;

/**
 * Two 1440×1024 coordinate frames pinned to the left and right viewport edges,
 * uniformly scaled down (never up) so the full design fits the viewport on both
 * axes with no scrolling. Each frame scales from its own top corner, so left-side
 * elements stay pinned left and right-side elements stay pinned right; below the
 * stage width the two frames coincide and the composition scales as one.
 */
export function FitStage({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      // Never scale up, and fit BOTH axes: below the stage width the two frames
      // coincide exactly (the 1440 design scaled down) instead of colliding.
      setScale(Math.min(1, vw / STAGE_W, vh / STAGE_H));
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  const frame: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    width: STAGE_W,
    height: STAGE_H,
    pointerEvents: 'none', // empty areas never block clicks to the other frame
  };

  return (
    <main
      className="page-enter"
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      <div style={{ ...frame, left: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {left}
      </div>
      <div style={{ ...frame, right: 0, transform: `scale(${scale})`, transformOrigin: 'top right' }}>
        {right}
      </div>
    </main>
  );
}
