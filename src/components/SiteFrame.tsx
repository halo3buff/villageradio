'use client';

import { usePathname } from 'next/navigation';
import { CommandPrompt } from '@/components/CommandPrompt';
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

  const prompt = NO_PROMPT(pathname) ? null : <CommandPrompt commands={commands} />;

  if (CHROMELESS.has(pathname)) {
    return <>{children}{prompt}</>;
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
      {prompt}
    </>
  );
}
