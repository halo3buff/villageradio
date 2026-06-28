'use client';

import { useIsMobile } from '@/lib/use-is-mobile';
import { MobileWork } from '@/components/mobile/MobileWork';
import { DesktopWork } from '@/components/DesktopWork';

export function WorkShell() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileWork />;
  return <DesktopWork />;
}
