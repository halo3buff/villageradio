import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = { title: 'Information' };

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

/** README_0 — the landing page's README: just the tree and a quote.
 *  The full manual (README_1) lives behind the station at /station/readme. */
export default function InformationPage() {
  return (
    <main className="page-enter" style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 56,
      background: 'var(--vlg-bg, #fff)',
    }}>
      <Image src="/images/tree_8bit.png" alt="Village Radio" width={165} height={205}
        style={{ width: 165, height: 205, objectFit: 'contain', filter: 'invert(var(--vlg-invert, 0))' }} />
      {/* the attribution keeps the column it has at the end of the quote's last line, one row lower;
          too narrow for it to fit there (it would wrap anyway), it simply takes the next row */}
      <style>{`
        .quote { padding-bottom: 1.5em; }
        .quote .attr { position: relative; top: 1.5em; white-space: nowrap; }
        @media (max-width: 427px) {
          .quote { padding-bottom: 0; }
          .quote .attr { display: block; top: 0; }
        }
      `}</style>
      <div className="quote" style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.5, textAlign: 'center', width: 'min(380px, calc(100vw - 48px))', color: 'var(--vlg-accent, #000)' }}>
        &ldquo;Thus a man will sometimes suffer half an hour of mortal fear with a robber, but once the knife is finally at his throat, even fear vanishes&rdquo; <span className="attr">-Dostoevsky</span>
      </div>
    </main>
  );
}
