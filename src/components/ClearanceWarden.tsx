'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { GATED_PATHS, revokeClearance } from '@/lib/clearance';

/**
 * Armed-on-leave clearance policy. Mounted once in the root layout.
 *
 * Watches SPA route changes: the moment the visitor navigates AWAY from a
 * gated page — including iOS swipe-back, which is a client-side history pop
 * within the app — that page's clearance burns. Returning to it by any means
 * (swipe-forward, back-swipe, history) hits the Gate with no pass → SIG_LOCKED.
 * Re-entry always costs another trip through the terminal or an official link.
 *
 * A refresh never changes the pathname, so a pass survives reloading the page
 * you're standing on — leaving is what burns it, not staying.
 */
export function ClearanceWarden() {
  const pathname = usePathname();
  const prevRef = useRef(pathname);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev !== pathname) {
      if (GATED_PATHS.has(prev)) revokeClearance(prev);
      prevRef.current = pathname;
    }
  }, [pathname]);

  return null;
}
