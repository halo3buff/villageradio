'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAudio } from '@/lib/audio-context';
import { CommandPrompt } from '@/components/CommandPrompt';
import { StationBar } from '@/components/StationBar';
import { useTrail } from '@/components/BackLink';
import type { NavCommand } from '@/lib/types';

/**
 * Wraps the global site chrome. The old chrome (nav, news strip, audio player) is
 * retired from every public route: they carry only the command prompt, and the
 * station's pages the station bar. Only /admin keeps the legacy chrome, exactly
 * as before.
 */

// /admin is a different machine and keeps the legacy chrome.
// The station's top bar belongs to the station and its README (README_1) only.
const HAS_BAR = (p: string) => p === '/station' || p.startsWith('/station/');

const NO_PROMPT = (p: string) => p === '/admin' || p.startsWith('/admin/');
export function SiteFrame({
  nav,
  audioPlayer,
  commands,
  children,
}: {
  nav: React.ReactNode;
  audioPlayer: React.ReactNode;
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

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return (
      <>
        {nav}
        <div className="pb-[76px]">{children}</div>
        {audioPlayer}
      </>
    );
  }

  return (
    <>
      {children}
      {HAS_BAR(pathname) && <StationBar />}
      {prompt}
    </>
  );
}
