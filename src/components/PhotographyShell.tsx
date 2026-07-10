'use client';

import type { Photo } from '@/lib/types';
import { useIsMobile } from '@/lib/use-is-mobile';
import { MobilePhotography } from '@/components/mobile/MobilePhotography';
import { DesktopPhotography } from '@/components/DesktopPhotography';

export function PhotographyShell({ photos }: { photos: Photo[] }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobilePhotography photos={photos} />;
  return <DesktopPhotography photos={photos} />;
}
