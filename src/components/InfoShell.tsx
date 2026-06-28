'use client';

import { useIsMobile } from '@/lib/use-is-mobile';
import { MobileInfo } from '@/components/mobile/MobileInfo';
import { DesktopInfo } from '@/components/DesktopInfo';

interface InfoShellProps {
  content: string;
}

export function InfoShell({ content }: InfoShellProps) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileInfo content={content} />;
  return <DesktopInfo content={content} />;
}
