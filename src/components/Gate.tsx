'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hasClearance } from '@/lib/clearance';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

/** Deterministic 4-hex-digit code for a path — same door, same error register. */
function lockCode(path: string): string {
  return Array.from(path)
    .reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 7)
    .toString(16).padStart(4, '0').toUpperCase();
}

/**
 * Checkpoint wrapper. Renders its children only if the visitor holds
 * clearance for `path` (granted by the command prompt / official nav —
 * see lib/clearance.ts). Everyone else gets the lock screen.
 *
 * Also re-runs the check on `pageshow` with `persisted: true` — the one
 * signal iOS gives when a page is resurrected from the back/forward cache
 * by a swipe gesture. That's what lets future traps re-lock a page the
 * instant a swipe brings it back.
 */
export function Gate({ path, children }: { path: string; children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'pending' | 'open' | 'locked'>('pending');

  useEffect(() => {
    const check = () => setState(hasClearance(path) ? 'open' : 'locked');
    check();
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) check(); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [path]);

  if (state === 'open') return <>{children}</>;
  if (state === 'pending') return null; // one client frame while storage is read

  return (
    <div
      onClick={() => router.push('/')}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'var(--vlg-bg, #fff)',
        cursor: 'pointer', fontFamily: MONO, color: 'var(--vlg-fg, #000)',
      }}
    >
      <div style={{ position: 'absolute', left: 24, top: '38%', fontSize: 12, lineHeight: '20px', whiteSpace: 'pre' }}>
        {`SIG_LOCKED 0x${lockCode(path)}\nCLEARANCE REQUIRED\n\n> `}
        <span style={{
          display: 'inline-block', width: 8, height: 13, background: 'var(--vlg-fg, #000)',
          verticalAlign: '-2px', animation: 'vr-blink 1s step-end infinite',
        }} />
      </div>
    </div>
  );
}
