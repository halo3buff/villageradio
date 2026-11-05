import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Information' };

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
// Morse: "We have on this earth what makes life worth living." -Darwish
const QUOTE = '.-..-. .-- . / .... .- ...- . / --- -. / - .... .. ... / . .- .-. - .... / .-- .... .- - / -- .- -.- . ... / .-.. .. ..-. . / .-- --- .-. - .... / .-.. .. ...- .. -. --. .-.-.- .-..-.';

/** README_0 — the landing page's README: just the rotating mark and a quote.
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
      {/* the attribution sits on its own row, flush with the right edge of the first two lines, out of the flow so the quote's last
          line stays centred on its own; on narrow screens it's simply the next row, centred */}
      <style>{`
        .quote { position: relative; padding-bottom: 1.5em; margin-bottom: -16.5px; } /* the Morse runs on downward: the mark and the quote's top hold their place */
        .quote .letter { white-space: nowrap; } /* a line never wraps inside a letter */
        .quote .attr { position: absolute; right: 5.2px; bottom: 0; white-space: nowrap; }
        @media (max-width: 427px) {
          .quote { padding-bottom: 0; }
          .quote .attr { position: static; display: block; }
        }
      `}</style>
      <div className="quote" style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.5, textAlign: 'center', width: 'min(380px, calc(100vw - 48px))', color: 'var(--vlg-accent, #000)', textShadow: '0 0 3px rgba(255,255,255,0.5)' }}>
        {QUOTE.split(' ').map((letter, i) => <span key={i}><span className="letter">{letter}</span> </span>)}<span className="attr">{'-....- -.. .- .-. .-- .. ... ....'}</span>
      </div>
    </main>
  );
}
