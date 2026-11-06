import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Information' };

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
/** README_0 — the landing page's README: just the rotating mark.
 *  The full manual (README_1) lives behind the station at /station/readme. */
export default function InformationPage() {
  return (
    <main className="page-enter" style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 56,
      background: 'var(--vlg-bg, #fff)',
    }}>
      {/* Donate — top-right, where README sits on the landing page */}
      <a href="https://pcrf1.app.neoncrm.com/campaigns/2023-gaza-relief--recovery" target="_blank" rel="noopener noreferrer" style={{
        position: 'absolute', top: 24, right: 24, zIndex: 2,
        fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em',
        color: 'var(--vlg-fg, #000)', textDecoration: 'none',
      }}>Donate</a>
      {/* eslint-disable-next-line @next/next/no-img-element -- animated, served as is */}
      <img src="/site_assets/logo_roto_v4.webp" alt="Village Radio"
        style={{ width: 230, height: 205, objectFit: 'contain', filter: 'brightness(0) invert(var(--vlg-invert, 0)) drop-shadow(0 0 3px rgba(255,255,255,0.6)) drop-shadow(0 0 8px rgba(255,255,255,0.28))' }} />
    </main>
  );
}
