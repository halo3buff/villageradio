'use client';

import { usePathname } from 'next/navigation';

/**
 * Wraps the global site chrome (nav, news strip, persistent audio player). The
 * redesigned homepage ("/") and listen page ("/listen") are full-bleed,
 * chromeless compositions, so all chrome is hidden there. The old footer
 * (news strip + audio player) is retired in the redesign and no longer renders
 * on any public route — only /admin keeps the full legacy chrome, exactly as
 * before.
 */
const CHROMELESS = new Set(['/', '/listen', '/transmit']);
export function SiteFrame({
  nav,
  audioPlayer,
  children,
}: {
  nav: React.ReactNode;
  audioPlayer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (CHROMELESS.has(pathname)) {
    return <>{children}</>;
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
    </>
  );
}
