'use client';

import { useIsMobile } from '@/lib/use-is-mobile';
import { MobilePhotography } from '@/components/mobile/MobilePhotography';
import { DesktopPhotography } from '@/components/DesktopPhotography';

export function PhotographyShell() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobilePhotography />;
  return <DesktopPhotography />;
}
