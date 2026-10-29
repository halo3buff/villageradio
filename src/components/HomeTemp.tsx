'use client';

import Link from 'next/link';
import { useEffect } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

/**
 * Temporary homepage while the rest is rebuilt: nothing but the rotating
 * station mark centred and README top-right. The command prompt is global — see
 * SiteFrame. The real composition still lives in HomeShell — swap it back in
 * src/app/page.tsx when it's ready.
 */
export function HomeTemp() {
  // The body carries Tailwind's `min-h-screen` (100vh). On iOS 100vh is the
  // LARGE viewport height, so with the URL bar showing it forces the body
  // taller than the visible area — a scrollbar on a page that has nothing to
  // scroll. This screen is fixed-position, so drop the floor while it's up.
  useEffect(() => {
    const body = document.body;
    const prev = body.style.minHeight;
    body.style.minHeight = '0';
    return () => { body.style.minHeight = prev; };
  }, []);

  return (
    <main style={{
      position: 'fixed', inset: 0, overflow: 'hidden',
      background: 'var(--vlg-bg, #fff)', color: 'var(--vlg-fg, #000)',
    }}>
      {/* README — top-right */}
      <Link href="/information" style={{
        position: 'absolute', top: 24, right: 24, zIndex: 2,
        fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em',
        color: 'var(--vlg-fg, #000)', textDecoration: 'none',
      }}>README</Link>

      {/* Two photos — dead centre, offset as on their page (the walk above, the water
          below), the page cut away so they sit straight on the site's paper. As tall
          as the screen allows, narrower than it on phones. (Previous: landing_triptych.webp.)
          The rotating mark (/site_assets/logo_roto.webp) or <ShannonDiagram /> can go back here. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- a single static image, served as is */}
      <img
        src="/site_assets/landing_pair.webp"
        alt="" aria-hidden
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'auto', height: 'auto', maxHeight: '70dvh', maxWidth: '76vw',
          pointerEvents: 'none',
        }}
      />
    </main>
  );
}
