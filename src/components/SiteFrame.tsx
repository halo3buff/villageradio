'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAudio } from '@/lib/audio-context';
import { CommandPrompt } from '@/components/CommandPrompt';
import { StationBar } from '@/components/StationBar';
import { useTrail } from '@/components/BackLink';
import type { NavCommand } from '@/lib/types';

/**
 * Wraps the global site chrome (nav, news strip, persistent audio player). The
 * redesigned homepage ("/") and listen page ("/listen") are full-bleed,
 * chromeless compositions, so all chrome is hidden there. The old footer
 * (news strip + audio player) is retired in the redesign and no longer renders
 * on any public route — only /admin keeps the full legacy chrome, exactly as
 * before.
 */
const CHROMELESS = new Set(['/', '/listen', '/transmit', '/station']);

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

  if (CHROMELESS.has(pathname)) {
    // Not on the landing page: the rotating logo has the screen to itself.
    return <>{children}{HAS_BAR(pathname) && <StationBar />}{prompt}</>;
  }

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
      {nav}
      {children}
      {HAS_BAR(pathname) && <StationBar />}
      {prompt}
    </>
  );
}
