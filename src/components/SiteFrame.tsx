'use client';

import { usePathname } from 'next/navigation';

/**
 * Wraps the global site chrome (nav, news strip, persistent audio player). The
 * redesigned homepage ("/") and listen page ("/listen") are full-bleed,
 * chromeless compositions, so we hide the chrome there only. Every other route
 * — including /admin — renders exactly as before.
 */
const CHROMELESS = new Set(['/', '/listen', '/transmit']);
export function SiteFrame({
  nav,
  newsStrip,
  audioPlayer,
  children,
}: {
  nav: React.ReactNode;
  newsStrip: React.ReactNode;
  audioPlayer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (CHROMELESS.has(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      {nav}
      <div className="pb-[76px]">{children}</div>
      {newsStrip}
      {audioPlayer}
    </>
  );
}
