import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Information' };

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

/** README_0 — the landing page's README: just the landing photo.
 *  The full manual (README_1) lives behind the station at /station/readme. */
export default function InformationPage() {
  return (
    <main className="page-enter readme-page" style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      background: 'var(--vlg-bg, #fff)',
    }}>
      <div style={{ position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a single static image, served as is */}
        <img src="/site_assets/landing_solo.webp" alt="" aria-hidden className="positive landing-photo"
          style={{ display: 'block', width: 'auto', height: 'auto', pointerEvents: 'none' }} />
        {/* command reference, set like README_1's block: under the photo, spanning its width, dot leaders between */}
        <div className="readme-cmds" style={{ width: 0, minWidth: '100%', fontFamily: MONO, fontSize: 11, lineHeight: '14px', color: 'var(--vlg-fg, #000)' }}>
          commands:
          {[['radio', 'gulam'], ['transmission', '/transmit']].map(([page, cmd]) => (
            <div key={cmd} style={{ display: 'flex', whiteSpace: 'nowrap' }}>
              <span>{page}</span>
              <span style={{ flex: 1, overflow: 'hidden', margin: '0 1ch' }}>{'.'.repeat(300)}</span>
              <span>{cmd}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
