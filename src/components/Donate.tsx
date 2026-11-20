const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

// 8-bit flags, 12x9 pixels each: r red, w white, k black, g green.
const R = '#ce1126', W = '#ffffff', K = '#000000', G = '#007a3d';
const tri = (x: number, y: number) => x <= Math.min(y, 8 - y);   // hoist triangle, 5 pixels deep
const bands = (y: number, top: string, mid: string, bot: string) => (y < 3 ? top : y < 6 ? mid : bot);
const syriaStar = (x: number, y: number) => [2, 6, 10].some((c) => (y === 4 && Math.abs(x - c) <= 1) || ((y === 3 || y === 5) && x === c));
const cedar = (x: number, y: number) => Math.abs(x - 5.5) <= ({ 2: 1, 3: 2, 4: 3, 5: 2, 6: 1 } as Record<number, number>)[y];
// name, where it donates, pixels
const FLAGS: [string, string, (x: number, y: number) => string][] = [
  ['Palestine', 'https://pcrf1.app.neoncrm.com/campaigns/2023-gaza-relief--recovery', (x, y) => (tri(x, y) ? R : bands(y, K, W, G))],
  ['Lebanon', 'https://crisisrelief.un.org/en/donate-lebanon-crisis', (x, y) => (y < 2 || y > 6 ? R : y === 6 ? (x === 5 || x === 6 ? G : W) : cedar(x, y) ? G : W)],
  ['Syria', 'https://give.unrefugees.org/page/1003569/donate/1?en_txn6=701Rf00000mQmlLIAS&en_txn7=701Rf00000mQrMoIAK', (x, y) => (syriaStar(x, y) ? R : bands(y, G, W, K))],
  ['Sudan', 'https://crisisrelief.un.org/en/donate-sudan-crisis', (x, y) => (tri(x, y) ? G : bands(y, R, W, K))],
];

function Flag({ name, px }: { name: string; px: (x: number, y: number) => string }) {
  return (
    <svg viewBox="0 0 12 9" width={32} height={24} shapeRendering="crispEdges" role="img" aria-label={name} className="positive" style={{ display: 'block' }}>
      {Array.from({ length: 108 }, (_, i) => <rect key={i} x={i % 12} y={Math.floor(i / 12)} width={1} height={1} fill={px(i % 12, Math.floor(i / 12))} />)}
    </svg>
  );
}
/** Donate, with the four flags under it, each linking to where it donates. Top-left of the landing page. */
export function Donate() {
  return (
    <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <span style={{
        marginRight: '-0.08em',   // letter-spacing trails the last letter; drop it so the centre is the word's
        fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)',
      }}>Donate</span>
      {FLAGS.map(([name, href, px]) => (
        <a key={name} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Donate: ${name}`}><Flag name={name} px={px} /></a>
      ))}
    </div>
  );
}
