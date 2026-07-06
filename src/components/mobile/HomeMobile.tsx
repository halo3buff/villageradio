'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useLayoutEffect } from 'react';
import { MobileScope } from '@/components/mobile/MobileScope';

/**
 * Figma frame is 402pt wide (iPhone 17). The entire composition is laid out in
 * design pixels on a fixed-size canvas, then uniformly scaled with a single
 * WIDTH-driven factor (layoutViewportW/402) so it always fills the full screen
 * width with zero side padding and proportions identical to Figma. If the
 * scaled canvas is taller than the visible viewport the page scrolls naturally.
 * Never mix vw/dvh per-axis units here: dynamic viewport height shrinks under
 * browser chrome and squashes everything vertically.
 *
 * SH is the canvas height: Figma's 874 minus 160px of trimmed open space
 * (everything below the README shifted up; gaps: top −33, README→box −12,
 * box→paragraph −52, paragraph→send-transmission −54, bottom −9) so the
 * whole composition fits a phone viewport with no scrolling.
 */
const SW = 402;
const SH = 714;

const DISPLAY = 'var(--font-hn-black), "Helvetica Neue", Arial, sans-serif';
const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const SEGOE = "'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif";
const RED = '#ff0000';
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.10) 3px)';

// Vertical shift for the whole mid-page cluster (paragraph, jumbled letters,
// ovals, censor bars, mirrored blocks) relative to the Figma-frame coordinates.
// −70 = the +15 "closer to send transmission" nudge minus the 85px of open
// space trimmed above the cluster (33 top + 52 box→paragraph).
const CLUSTER_DY = -82;

const LOGO_LETTERS: { t: string; x: number; y: number; rot: number; flipY: boolean }[] = [
  { t: 'E',    x: 143, y: 568, rot: 0,   flipY: false },
  { t: 'E',    x: 159, y: 599, rot: 90,  flipY: false },
  { t: 'E',    x: 130, y: 585, rot: 90,  flipY: false },
  { t: 'VGE',  x: 149, y: 674, rot: -90, flipY: true  },
  { t: 'VILL', x: 161, y: 615, rot: 0,   flipY: true  },
  { t: 'E',    x: 140, y: 670, rot: 90,  flipY: false },
  { t: 'VGE',  x: 155, y: 647, rot: 90,  flipY: false },
];

const LOGO_OVAL_TOPS = [613, 619, 624, 630, 635, 641, 651, 652, 653];
const LOGO_OVAL_X = 145;
const LOGO_OVAL = 15;

// Paragraph text uses the info/README-page face (IBM Plex Mono). Mono glyphs
// are wider than the old HN-medium, so fontSize drops 11→9 to keep the block
// the same width; the fixed 13.4px lineHeight preserves the original row grid
// that the censor bars and mirrored overlays are aligned to.
const PARA: React.CSSProperties = {
  fontFamily: MONO, fontSize: 9, lineHeight: '13.4px',
  textAlign: 'left', textTransform: 'uppercase', whiteSpace: 'pre',
  color: '#000',
};

function z2(n: number) { return String(Math.floor(n)).padStart(2, '0'); }
function buildClock(d: Date) {
  const h = z2(d.getUTCHours()), m = z2(d.getUTCMinutes()), s = z2(d.getUTCSeconds());
  const f = z2(Math.floor(d.getUTCMilliseconds() / 10));
  return { utc: `${h}:${m}:${s} UTC`, mil: `${h}${m}${s}Z`, bc: `T-${h}:${m}:${s}:${f}` };
}
function hexLine(seed: number) {
  let out = '';
  const rnd = (i: number) => Math.abs(Math.sin(i * 997.31 + seed * 0.01)) * 0xffff;
  for (let i = 0; i < 24; i++) {
    out += `0x${Math.floor(rnd(i)).toString(16).padStart(4, '0').toUpperCase()} `;
    if (i % 6 === 5) out += '// ';
  }
  return out;
}

function RedLink({ href, children }: { href: string; children: string }) {
  return <Link href={href} style={{ color: RED, textDecoration: 'none' }}>{children}</Link>;
}

/**
 * One uniform, width-driven scale factor — aspect ratio is locked to the Figma
 * frame. Reads the LAYOUT viewport (documentElement.clientWidth), never the
 * visual viewport: pinch-zooming shrinks the visual viewport, and reacting to
 * it re-scaled the whole canvas mid-pinch, throwing the page to the top-left.
 * The layout viewport is stable under zoom, so zoom now behaves normally.
 */
function useUniformScale() {
  const [scale, setScale] = useState<number | null>(null);
  useLayoutEffect(() => {
    const update = () => setScale(document.documentElement.clientWidth / SW);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return scale;
}

export function HomeMobile() {
  const scale = useUniformScale();
  const [clock, setClock] = useState(() => buildClock(new Date()));
  const [ticker, setTicker] = useState(() => hexLine(0));

  useEffect(() => {
    let f = 0;
    const id = setInterval(() => {
      f++;
      setClock(buildClock(new Date()));
      if (f % 4 === 0) setTicker(hexLine(f));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // The site chrome paints html/body near-black; this page is white and can
  // scroll, so force a white document behind it (kills the black band that
  // shows behind the page when iOS resizes the visual viewport after nav).
  // Also neutralise the body's Tailwind `min-h-screen` (100vh): on iOS, 100vh
  // is the LARGE viewport height (chrome collapsed), so with the URL bar
  // expanded it forces the body taller than the visible area — a permanent
  // scrollbar on load no matter how short this page's content is.
  useEffect(() => {
    const html = document.documentElement, body = document.body;
    const prevHtml = html.style.backgroundColor, prevBody = body.style.backgroundColor;
    const prevMinH = body.style.minHeight;
    html.style.backgroundColor = '#fff';
    body.style.backgroundColor = '#fff';
    body.style.minHeight = '0';
    return () => {
      html.style.backgroundColor = prevHtml;
      body.style.backgroundColor = prevBody;
      body.style.minHeight = prevMinH;
    };
  }, []);

  return (
    <main style={{
      // `overflow: hidden` swallows sub-pixel spill from the fractional scale
      // (e.g. canvas 698.4px in a 698px round) — without it, browsers can show
      // a scrollbar for <1px of internal overflow. If the main element itself
      // is taller than a small viewport, the DOCUMENT still scrolls normally.
      position: 'relative', minHeight: '100dvh', overflow: 'hidden', background: '#fff',
      // Reserve the true scaled height so the page ends exactly at the canvas bottom
      height: scale === null ? SH : SH * scale,
    }}>
      <div className="page-enter" style={{
        position: 'absolute', left: 0, top: 0,
        width: SW, height: SH,
        transform: `scale(${scale ?? 1})`, transformOrigin: 'top left',
        visibility: scale === null ? 'hidden' : 'visible',
      }}>

        {/* README — top-right, links to /information */}
        <Link href="/information" style={{
          position: 'absolute', left: 315, top: 28,
          fontFamily: SEGOE, fontSize: 11, lineHeight: '12px',
          color: '#000', textDecoration: 'none',
        }}>README</Link>

        {/* Chromeless vectorscope — perfect square, every side equal */}
        <div style={{ position: 'absolute', left: 17, top: 72, width: 368, height: 368 }}>
          <MobileScope />
        </div>

        {/* Broadcast status — top-left of the scope box */}
        <div style={{
          position: 'absolute', left: 24, top: 79, width: 320,
          fontFamily: BODY, fontSize: 11, lineHeight: '13px', textTransform: 'uppercase',
          color: '#000', zIndex: 3, pointerEvents: 'none',
        }}>
          {'> BROADCAST '}
          <span style={{ color: RED }}>[LIVE]</span>
          <span style={{ color: RED, animation: 'vr-blink 1s step-end infinite' }}> █</span>
        </div>

        {/* Timecode — top-right inside the scope box */}
        <div style={{
          position: 'absolute', left: 285, top: 80, width: 92,
          textAlign: 'right', zIndex: 3, pointerEvents: 'none',
        }}>
          <div style={{ fontFamily: MONO, fontSize: 7, lineHeight: '12px', fontVariantNumeric: 'tabular-nums' }}>
            <div style={{ color: '#000' }}>{clock.utc}</div>
            <div style={{ color: '#555' }}>{clock.mil}</div>
            <div style={{ color: RED, fontSize: 6 }}>{clock.bc}</div>
          </div>
        </div>

        {/* Freq ticker — scrolling strip below the scope box */}
        <div style={{
          position: 'absolute', left: 17, top: 446, width: 368, height: 14,
          overflow: 'hidden', pointerEvents: 'none', zIndex: 3,
        }}>
          <div className="ticker" style={{
            fontFamily: MONO, fontSize: 6, lineHeight: '10px', letterSpacing: '0.04em',
            color: '#555', whiteSpace: 'nowrap',
          }}>
            {ticker}&nbsp;&nbsp;&nbsp;&nbsp;{ticker}
          </div>
        </div>

        {/* VILLAGE word-mark cluster — ovals */}
        {LOGO_OVAL_TOPS.map((t, i) => (
          <Image key={`ov-${i}`} src="/images/IMG_2411.png" alt="" aria-hidden width={LOGO_OVAL} height={LOGO_OVAL}
            style={{
              position: 'absolute', left: LOGO_OVAL_X, top: t + CLUSTER_DY,
              width: LOGO_OVAL, height: LOGO_OVAL,
              zIndex: 4, pointerEvents: 'none',
            }} />
        ))}

        {/* VILLAGE word-mark cluster — letters */}
        {LOGO_LETTERS.map((l, i) => (
          <span key={`lt-${i}`} aria-hidden style={{
            position: 'absolute', left: l.x, top: l.y + CLUSTER_DY,
            fontFamily: DISPLAY, fontSize: 34,
            lineHeight: 1, color: '#000', zIndex: 4, whiteSpace: 'nowrap',
            transform: `rotate(${l.rot}deg) scaleY(${l.flipY ? -1 : 1})`, transformOrigin: 'center',
          }}>{l.t}</span>
        ))}

        {/* Main structure paragraph */}
        <div style={{ position: 'absolute', left: 212, top: 556 + CLUSTER_DY, zIndex: 3, ...PARA }}>
          {`  <RECT:FILL_NULL>
   987.4 `}<RedLink href="/news">13 4 22 18</RedLink>{`
93.1■1024.351053.4
4.35  77`}<RedLink href="/photography">{`15 7 14 19 14 6 17 0 15 7
24`}</RedLink>{`509  1021.73■  1   7  1021.73
77/759.846  //
E
  </PATH_NULL>`}
        </div>

        {/* Censor bar — end of the 93.1 line */}
        <div aria-hidden style={{
          position: 'absolute', left: 321, top: 587 + CLUSTER_DY, width: 46, height: 9.5,
          background: '#000', zIndex: 5,
        }} />

        {/* Censor bar — long bar under the paragraph */}
        <div aria-hidden style={{
          position: 'absolute', left: 195, top: 672 + CLUSTER_DY, width: 156, height: 9.5,
          background: '#000', zIndex: 5,
        }} />

        {/* Mirrored fragment — overlays the E / PATH_NULL lines */}
        <div style={{
          position: 'absolute', left: 264, top: 641 + CLUSTER_DY, width: 97, zIndex: 3,
          transform: 'scaleX(-1)', transformOrigin: 'center', ...PARA,
        }}>
          {`.`}<RedLink href="/work">22.14.17.10</RedLink>{`.938.8
34:756.675`}
        </div>

        {/* Mirrored dither + signal block — below the long censor bar */}
        <div style={{
          position: 'absolute', left: 265, top: 686 + CLUSTER_DY, width: 102, zIndex: 3,
          transform: 'scaleX(-1)', transformOrigin: 'center', ...PARA,
        }}>
          {` ░▒▓▓▒░
740.02.73MΔ1053.
46Λ80`}<RedLink href="/listen">1181819413</RedLink>
        </div>

        {/* send transmission — fontSize and letterSpacing are LOCKED */}
        <Link href="/transmit" style={{
          position: 'absolute', left: 31, top: 673,
          fontFamily: DISPLAY, fontSize: 32, lineHeight: '31px', letterSpacing: '-0.13em',
          color: '#000', textDecoration: 'none', whiteSpace: 'nowrap', zIndex: 3,
        }}>
          {'__________send transmission'}
        </Link>

        {/* CRT scanlines — scope box only */}
        <div aria-hidden style={{
          position: 'absolute', left: 17, top: 72, width: 368, height: 368,
          zIndex: 7, pointerEvents: 'none',
          background: SCANLINES, opacity: 0.6,
        }} />

      </div>
    </main>
  );
}
