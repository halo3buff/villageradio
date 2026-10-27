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

      {/* The rotating station mark — dead centre. An animated WebP cropped from
          the 1920x1080 render (logo_roto_8bit.webm): iOS Safari plays VP9 alpha
          as black, WebP alpha works everywhere. Sized as the old full frame was
          (the crop is 0.375 of its width).
          Swap <ShannonDiagram /> back in here to restore the diagram. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- animated, served as is */}
      <img
        src="/site_assets/logo_roto.webp"
        alt="" aria-hidden
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'clamp(285px, 30vw, 450px)', maxWidth: 'none', height: 'auto',
          pointerEvents: 'none',
        }}
      />
    </main>
  );
}
