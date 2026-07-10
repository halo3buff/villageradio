'use client';

import type { NavCommand } from '@/lib/types';
import { useIsMobile } from '@/lib/use-is-mobile';
import { MobileInfo } from '@/components/mobile/MobileInfo';
import { DesktopInfo } from '@/components/DesktopInfo';

interface InfoShellProps {
  content: string;
  commands: NavCommand[];
}

export function InfoShell({ content, commands }: InfoShellProps) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileInfo content={content} commands={commands} />;
  return <DesktopInfo content={content} commands={commands} />;
}
