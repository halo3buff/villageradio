'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { M_PLUS_Rounded_1c } from 'next/font/google';
import { CommandPrompt } from '@/components/CommandPrompt';
import type { NavCommand } from '@/lib/types';

export const ps2Font = M_PLUS_Rounded_1c({ weight: ['800'], subsets: ['latin'], display: 'swap' });

// lavender-white bloom top-left, falling to olive in the far corner
export const PS2_BG =
  'radial-gradient(ellipse 60% 55% at 32% 34%, rgba(248,248,255,0.95) 0%, rgba(230,230,238,0.5) 45%, rgba(230,230,238,0) 75%),' +
  'linear-gradient(128deg, #d6d6de 0%, #c3c3c8 38%, #9a9988 70%, #4f4d3c 100%)';

const Glyph = ({ k }: { k: 'x' | 'o' | 't' }) => (
  <svg viewBox="0 0 20 20" width="1em" height="1em" style={{ display: 'inline-block', overflow: 'visible', marginRight: '0.35em', verticalAlign: '-0.12em' }}>
    {k === 'x' && <path d="M4 4 L16 16 M16 4 L4 16" stroke="#9fc0ff" strokeWidth="3.2" strokeLinecap="round" />}
    {k === 'o' && <circle cx="10" cy="10" r="6.5" fill="none" stroke="#ff6577" strokeWidth="3" />}
    {k === 't' && <path d="M10 3.5 L17 16 L3 16 Z" fill="none" stroke="#3fe3a3" strokeWidth="2.8" strokeLinejoin="round" />}
  </svg>
);

/**
 * The PS2 button legend, standing in for the command prompt: ✕ opens what's selected,
 * ○ backs out to the browser, △ Options summons the old prompt for the words that aren't on any icon.
 */
export function PS2Bar({ commands }: { commands: NavCommand[] }) {
  const pathname = usePathname();
  const router = useRouter();
  // Options belongs to the page it was opened on: arriving anywhere else puts the prompt away
  const [optionsAt, setOptionsAt] = useState<string | null>(null);
  const options = optionsAt === pathname;
  const setOptions = (f: (o: boolean) => boolean) => setOptionsAt(f(options) ? pathname : null);
  const home = pathname === '/';

  const toggleOptions = () => {
    // rendered synchronously so focus lands inside the tap, which is what lets iOS raise the keyboard
    flushSync(() => setOptions((o) => !o));
    if (!options) document.querySelector<HTMLInputElement>('input[aria-label="command"]')?.focus();
  };

  return (
    <>
      <style>{`
        .ps2-text { color: #fff; -webkit-text-stroke: 0.3em #1b1b1f; paint-order: stroke fill;
          text-shadow: 0 0.06em 0.1em rgba(0,0,0,0.35); letter-spacing: 0.01em; }
        .ps2-legend { position: fixed; z-index: 2050; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom, 0px) + 3.5vh);
          display: grid; grid-template-columns: 1fr auto auto 1fr; column-gap: 6vw; padding: 0 4vw; font-size: clamp(17px, 2.7vw, 40px);
          pointer-events: none; transition: transform 0.25s ease; }
        .ps2-legend button { all: unset; cursor: pointer; pointer-events: auto; white-space: nowrap; }
        .ps2-legend button[disabled] { opacity: 0.45; cursor: default; }
        .ps2-legend button:first-child { grid-column: 2; }
        .ps2-legend .opt { justify-self: end; }
        .ps2-legend[data-open="1"] { transform: translateY(calc(-1 * clamp(44px, 6vh, 60px))); }
      `}</style>
      <nav className={`ps2-legend ${ps2Font.className}`} data-open={options ? 1 : 0}>
        <button className="ps2-text" disabled={!home} onClick={() => window.dispatchEvent(new Event('ps2:enter'))}>
          <Glyph k="x" />Enter
        </button>
        <button className="ps2-text" disabled={home} onClick={() => router.push('/')}>
          <Glyph k="o" />Back
        </button>
        <button className="ps2-text opt" onClick={toggleOptions}>
          <Glyph k="t" />{options ? 'Close' : 'Options'}
        </button>
      </nav>
      {options && <CommandPrompt commands={commands} />}
    </>
  );
}
