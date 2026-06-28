'use client';

import { useIsMobile } from '@/lib/use-is-mobile';
import { MobileListen } from '@/components/mobile/MobileListen';
import { ListenConsole } from '@/components/ListenConsole';

export function ListenShell() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileListen />;
  return <ListenConsole />;
}
