import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Melee', robots: { index: false } };

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
// The author's own hosted page (nikhilunni/melee, a Rust/WebGPU port with no game data); each player
// drops in their own disc image, read in their browser only. The repo has no licence, so it is
// framed, not rebuilt.
const PORT_URL = 'https://nikhilunni.github.io/melee/';

/** Playable Melee, reached with the `melee` command: the port in a window, under scanlines. */
export default function MeleePage() {
  return (
    <main style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      <div style={{
        position: 'absolute', inset: 'min(11vh, 96px) min(16vw, 220px)', display: 'flex', flexDirection: 'column',
        fontFamily: MONO, fontSize: 10, lineHeight: '14px', color: 'var(--vlg-fg, #000)', background: '#000', border: '1px solid currentColor',
      }}>
        <div style={{ display: 'flex', gap: 12, padding: '2px 6px', borderBottom: '1px solid currentColor', background: 'var(--vlg-bg, #fff)' }}>
          <span>MELEE.EXE  NEEDS YOUR OWN NTSC 1.02 DISC IMAGE · CHROME / EDGE / SAFARI</span>
          {/* a full page load, not a client navigation: the online page's isolation headers apply only to a fresh document */}
          <a href="/melee/online" style={{ color: 'inherit', textDecoration: 'none', marginLeft: 'auto' }}>[ONLINE]</a>
          <a href="/" style={{ color: 'inherit', textDecoration: 'none' }}>[x]</a>
        </div>
        <div className="crt" style={{ flex: 1, minHeight: 0 }}>
          <iframe src={PORT_URL} title="Melee" allow="gamepad; fullscreen; autoplay"
            allowFullScreen style={{ display: 'block', width: '100%', height: '100%', border: 'none' }} />
        </div>
      </div>
    </main>
  );
}
