'use client';

import { useIsMobile } from '@/lib/use-is-mobile';
import { MobileNews } from '@/components/mobile/MobileNews';
import { DesktopNews } from '@/components/DesktopNews';

export function NewsShell() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileNews />;
  return <DesktopNews />;
}
