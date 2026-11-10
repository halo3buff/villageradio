'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAudio } from '@/lib/audio-context';
import { CommandPrompt } from '@/components/CommandPrompt';
import { StationBar } from '@/components/StationBar';
import { useTrail } from '@/components/BackLink';
import type { NavCommand } from '@/lib/types';

/**
 * Wraps the global site chrome: public routes carry only the command prompt, and the
 * station's pages the station bar. /admin brings its own chrome (AdminShell).
 */

// The station's top bar belongs to the station only (which keeps it off for now).
const HAS_BAR = (p: string) => p === '/station';

const NO_PROMPT = (p: string) => p === '/admin' || p.startsWith('/admin/') || p === '/rec';
export function SiteFrame({
  commands,
  children,
}: {
  commands: NavCommand[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { pause } = useAudio();

  // The landing page has no play/pause, so arriving there always silences the station.
  // pause is a fresh function every render, so key on the path alone: fire once per arrival.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (pathname === '/') pause(); }, [pathname]);
  useTrail(pathname);

  const prompt = NO_PROMPT(pathname) ? null : <CommandPrompt commands={commands} />;

  if (pathname === '/admin' || pathname.startsWith('/admin/')) return <>{children}</>;

  return (
    <>
      {children}
      {pathname !== '/rec' && <><i className="edge-tint top" aria-hidden /><i className="edge-tint bottom" aria-hidden /></>}
      {HAS_BAR(pathname) && <StationBar />}
      {prompt}
    </>
  );
}
