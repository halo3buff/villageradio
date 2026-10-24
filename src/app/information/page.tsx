import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = { title: 'Information' };

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

/** README_0 — the landing page's README: just the tree and the contact address.
 *  The full manual (README_1) lives behind the station at /station/readme. */
export default function InformationPage() {
  return (
    <main className="page-enter" style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      background: 'var(--vlg-bg, #fff)',
    }}>
      <Image src="/images/tree_8bit.png" alt="Village Radio" width={165} height={205}
        style={{ width: 165, height: 205, objectFit: 'contain', filter: 'invert(var(--vlg-invert, 0))' }} />
      <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--vlg-accent, #000)' }}>
        cloudmain2stock@gmail.com
      </div>
    </main>
  );
}
