import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Information' };

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

// 8-bit flags, 12x9 pixels each: r red, w white, k black, g green.
const R = '#ce1126', W = '#ffffff', K = '#000000', G = '#007a3d';
const tri = (x: number, y: number) => x <= Math.min(y, 8 - y);   // hoist triangle, 5 pixels deep
const bands = (y: number, top: string, mid: string, bot: string) => (y < 3 ? top : y < 6 ? mid : bot);
const syriaStar = (x: number, y: number) => [3, 8].some((c) => (y === 4 && Math.abs(x - c) <= 1) || ((y === 3 || y === 5) && x === c));
const cedar = (x: number, y: number) => Math.abs(x - 5.5) <= ({ 2: 1, 3: 2, 4: 3, 5: 2, 6: 1 } as Record<number, number>)[y];
const FLAGS: [string, (x: number, y: number) => string][] = [
  ['Palestine', (x, y) => (tri(x, y) ? R : bands(y, K, W, G))],
  ['Lebanon', (x, y) => (y < 2 || y > 6 ? R : y === 6 ? (x === 5 || x === 6 ? G : W) : cedar(x, y) ? G : W)],
  ['Syria', (x, y) => (syriaStar(x, y) ? G : bands(y, R, W, K))],
  ['Sudan', (x, y) => (tri(x, y) ? G : bands(y, R, W, K))],
];

function Flag({ name, px }: { name: string; px: (x: number, y: number) => string }) {
  return (
    <svg viewBox="0 0 12 9" width={32} height={24} shapeRendering="crispEdges" role="img" aria-label={name} style={{ display: 'block' }}>
      {Array.from({ length: 108 }, (_, i) => <rect key={i} x={i % 12} y={Math.floor(i / 12)} width={1} height={1} fill={px(i % 12, Math.floor(i / 12))} />)}
    </svg>
  );
}
/** README_0 — the landing page's README: just the rotating mark.
 *  The full manual (README_1) lives behind the station at /station/readme. */
export default function InformationPage() {
  return (
    <main className="page-enter" style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 56,
      background: 'var(--vlg-bg, #fff)',
    }}>
      {/* Donate — top-right, where README sits on the landing page — with the flags centred under it */}
      <div style={{ position: 'absolute', top: 24, right: 24, zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <a href="https://pcrf1.app.neoncrm.com/campaigns/2023-gaza-relief--recovery" target="_blank" rel="noopener noreferrer" style={{
        marginRight: '-0.08em',   // letter-spacing trails the last letter; drop it so the centre is the word's
        fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em',
        color: 'var(--vlg-fg, #000)', textDecoration: 'none',
      }}>Donate</a>
        {FLAGS.map(([name, px]) => <Flag key={name} name={name} px={px} />)}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- animated, served as is */}
      <img src="/site_assets/logo_roto_v4.webp" alt="Village Radio"
        style={{ width: 230, height: 205, objectFit: 'contain', filter: 'brightness(0) invert(var(--vlg-invert, 0)) drop-shadow(0 0 3px rgba(255,255,255,0.6)) drop-shadow(0 0 8px rgba(255,255,255,0.28))' }} />
    </main>
  );
}
