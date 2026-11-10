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
/* the photo's own top and bottom edge colours, for iOS Safari to paint its bars with (globals.css) */
export function EdgeTint() {
  return (
    <>
      <div className="edge-tint" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 40, background: '#919595', opacity: 0, pointerEvents: 'none' }} />
      <div className="edge-tint" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 40, background: '#b6b1aa', opacity: 0, pointerEvents: 'none' }} />
    </>
  );
}

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
      {pathname !== '/rec' && <EdgeTint />}
      {HAS_BAR(pathname) && <StationBar />}
      {prompt}
    </>
  );
}
