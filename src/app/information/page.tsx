import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = { title: 'Information' };

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
// Morse: "Thus a man will sometimes suffer half an hour of mortal fear with a robber, but once the knife is finally at his throat, even fear vanishes" -Dostoevsky
const QUOTE = '.-..-. - .... ..- ... / .- / -- .- -. / .-- .. .-.. .-.. / ... --- -- . - .. -- . ... / ... ..- ..-. ..-. . .-. / .... .- .-.. ..-. / .- -. / .... --- ..- .-. / --- ..-. / -- --- .-. - .- .-.. / ..-. . .- .-. / .-- .. - .... / .- / .-. --- -... -... . .-. --..-- / -... ..- - / --- -. -.-. . / - .... . / -.- -. .. ..-. . / .. ... / ..-. .. -. .- .-.. .-.. -.-- / .- - / .... .. ... / - .... .-. --- .- - --..-- / . ...- . -. / ..-. . .- .-. / ...- .- -. .. ... .... . ... .-..-.';

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
      {/* the attribution sits on its own row, flush with the right edge of the first two lines, out of the flow so the quote's last
          line stays centred on its own; on narrow screens it's simply the next row, centred */}
      <style>{`
        .quote { position: relative; padding-bottom: 1.5em; margin-bottom: -99px; } /* the Morse runs on downward: the tree and the quote's top stay where the English had them */
        .quote .letter { white-space: nowrap; } /* a line never wraps inside a letter */
        .quote .attr { position: absolute; right: 5.2px; bottom: 0; white-space: nowrap; }
        @media (max-width: 427px) {
          .quote { padding-bottom: 0; margin-bottom: -115.5px; }
          .quote .attr { position: static; display: block; }
        }
      `}</style>
      <div className="quote" style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.5, textAlign: 'center', width: 'min(380px, calc(100vw - 48px))', color: 'var(--vlg-accent, #000)' }}>
        {QUOTE.split(' ').map((letter, i) => <span key={i}><span className="letter">{letter}</span> </span>)}<span className="attr">{'-....- -.. --- ... - --- . ...- ... -.- -.--'}</span>
      </div>
    </main>
  );
}
