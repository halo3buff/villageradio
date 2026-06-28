'use client';

import { useIsMobile } from '@/lib/use-is-mobile';
import { HomeDesktop } from '@/components/HomeDesktop';
import { HomeMobile } from '@/components/mobile/HomeMobile';

/**
 * Picks the homepage layout by viewport. `useIsMobile()` returns null until mounted
 * (server + first client render agree → no hydration mismatch), and null falls through
 * to the desktop layout — exactly what the server rendered. On a phone it swaps to the
 * mobile composition after mount.
 */
export function HomeShell() {
  const isMobile = useIsMobile();
  return isMobile ? <HomeMobile /> : <HomeDesktop />;
}
