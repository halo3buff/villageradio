'use client';

import { useState, useEffect } from 'react';

/**
 * Viewport gate for swapping desktop ↔ mobile layouts. Returns `null` until mounted
 * so server render and first client render agree (no hydration mismatch); callers
 * treat `null` as "not yet known" and fall back to the desktop layout, which is what
 * the server rendered. After mount it tracks the media query live.
 */
export function useIsMobile(breakpoint = 768): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}
