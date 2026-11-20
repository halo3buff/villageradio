import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Melee online', robots: { index: false } };

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
// Each player's own melee-web build, served on their own machine by its serve.py. Nothing of the
// game passes through this site: it only frames the player's local copy.
const LOCAL = 'http://127.0.0.1:5191/';

/** Online Melee: reached from the `melee` window's ONLINE link. Isolated by next.config headers. */
export default function MeleeOnlinePage() {
  return (
    <main style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', flexDirection: 'column', background: '#000', color: '#fff', fontFamily: MONO, fontSize: 10, lineHeight: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', borderBottom: '1px solid #fff' }}>
        <span>MELEE.EXE  ONLINE · YOUR OWN COPY MUST BE RUNNING ON THIS COMPUTER · CHROME / EDGE</span>
        <a href="/" style={{ color: 'inherit', textDecoration: 'none' }}>[x]</a>
      </div>
      <iframe src={LOCAL} title="Melee online"
        allow="cross-origin-isolated; gamepad; hid; fullscreen; autoplay; local-network-access; local-network; loopback-network"
        allowFullScreen style={{ flex: 1, width: '100%', border: 'none' }} />
    </main>
  );
}
