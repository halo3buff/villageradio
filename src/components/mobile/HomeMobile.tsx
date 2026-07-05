'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { MobileScope } from '@/components/mobile/MobileScope';

const SW = 402;
const SH = 874;
const vw = (n: number) => `${(n / SW * 100).toFixed(2)}vw`;
const dvh = (n: number) => `${(n / SH * 100).toFixed(2)}dvh`;

const DISPLAY = 'var(--font-hn-black), "Helvetica Neue", Arial, sans-serif';
const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const SEGOE = "'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif";
const RED = '#ff0000';
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.10) 3px)';

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

// Figma: Helvetica Neue Medium 11.566px / line-height 14.111px (= 1.22)
const PARA: React.CSSProperties = {
  fontFamily: BODY, fontSize: vw(11.57), lineHeight: 1.22,
  textAlign: 'left', textTransform: 'uppercase', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
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

export function HomeMobile() {
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

  return (
    <main style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#fff' }}>
      <div className="page-enter" style={{ position: 'absolute', inset: 0 }}>

        {/* README — top right (Figma 186:68), links to /information */}
        <Link href="/information" style={{
          position: 'absolute', left: vw(315), top: dvh(61),
          fontFamily: SEGOE, fontSize: vw(11.57), lineHeight: dvh(11.57),
          color: '#000', textDecoration: 'none',
        }}>README</Link>

        {/* Chromeless vectorscope */}
        <div style={{ position: 'absolute', left: vw(17), top: dvh(117), width: vw(368), height: dvh(400) }}>
          <MobileScope />
        </div>

        {/* Broadcast status — top-left of the scope box */}
        <div style={{
          position: 'absolute', left: vw(24), top: dvh(124), width: vw(320),
          fontFamily: BODY, fontSize: vw(11), lineHeight: dvh(11), textTransform: 'uppercase',
          color: '#000', zIndex: 3, pointerEvents: 'none',
        }}>
          {'> BROADCAST '}
          <span style={{ color: RED }}>[LIVE]</span>
          <span style={{ color: RED, animation: 'vr-blink 1s step-end infinite' }}> █</span>
        </div>

        {/* Timecode — top-right inside the scope box */}
        <div style={{
          position: 'absolute', left: vw(285), top: dvh(125), width: vw(92),
          textAlign: 'right', zIndex: 3, pointerEvents: 'none',
        }}>
          <div style={{ fontFamily: MONO, fontSize: vw(7), lineHeight: dvh(12), fontVariantNumeric: 'tabular-nums' }}>
            <div style={{ color: '#000' }}>{clock.utc}</div>
            <div style={{ color: '#555' }}>{clock.mil}</div>
            <div style={{ color: RED, fontSize: vw(6) }}>{clock.bc}</div>
          </div>
        </div>

        {/* Freq ticker — scrolling strip below the scope box */}
        <div style={{
          position: 'absolute', left: vw(17), top: dvh(523), width: vw(368), height: dvh(14),
          overflow: 'hidden', pointerEvents: 'none', zIndex: 3,
        }}>
          <div className="ticker" style={{
            fontFamily: MONO, fontSize: vw(6), lineHeight: dvh(10), letterSpacing: '0.04em',
            color: '#555', whiteSpace: 'nowrap',
          }}>
            {ticker}&nbsp;&nbsp;&nbsp;&nbsp;{ticker}
          </div>
        </div>

        {/* VILLAGE word-mark cluster — ovals */}
        {LOGO_OVAL_TOPS.map((t, i) => (
          <Image key={`ov-${i}`} src="/images/IMG_2411.png" alt="" aria-hidden width={LOGO_OVAL} height={LOGO_OVAL}
            style={{
              position: 'absolute', left: vw(LOGO_OVAL_X), top: dvh(t),
              width: vw(LOGO_OVAL), height: vw(LOGO_OVAL),
              zIndex: 4, pointerEvents: 'none',
            }} />
        ))}

        {/* VILLAGE word-mark cluster — letters */}
        {LOGO_LETTERS.map((l, i) => (
          <span key={`lt-${i}`} aria-hidden style={{
            position: 'absolute', left: vw(l.x), top: dvh(l.y),
            fontFamily: DISPLAY, fontSize: vw(34),
            lineHeight: 1, color: '#000', zIndex: 4, whiteSpace: 'nowrap',
            transform: `rotate(${l.rot}deg) scaleY(${l.flipY ? -1 : 1})`, transformOrigin: 'center',
          }}>{l.t}</span>
        ))}

        {/* Main structure paragraph — Figma 186:36 */}
        <div style={{ position: 'absolute', left: vw(198), top: dvh(615), width: vw(182), zIndex: 3, ...PARA }}>
          {`[STRUCTURE_01:VOID]
  0X1440X // STNSION
  <RECT:FILL_NULL>
   987.4 `}<RedLink href="/news">13 4 22 18</RedLink>{` 57-740.09ONST_Y
   1053.804.60⌠1028.447                     93.1■1024.351053.46Λ804Σ1
4.35  77`}<RedLink href="/photography">15 7 14 19 14 6 17 0 15 7 24</RedLink>{`509  1021.73■  1   7  1021.73  77/759.846  //
E
  </PATH_NULL>`}
        </div>

        {/* "0X228" — mirrored (Figma 186:61) */}
        <div aria-hidden style={{
          position: 'absolute', left: vw(315), top: dvh(635), width: vw(36), zIndex: 3,
          transform: 'scaleX(-1)', transformOrigin: 'center', ...PARA,
        }}>
          {'0X228 '}
        </div>

        {/* Censor bar 1 — Figma 186:62 */}
        <div aria-hidden style={{
          position: 'absolute', left: vw(195), top: dvh(672), width: vw(156), height: dvh(9.46),
          background: '#000', zIndex: 5,
        }} />

        {/* Censor bar 2 — Figma 186:63 */}
        <div aria-hidden style={{
          position: 'absolute', left: vw(250), top: dvh(701), width: vw(46), height: dvh(9.46),
          background: '#000', zIndex: 5,
        }} />

        {/* M1231 mirrored block — Figma 186:37 (leading blank line is in the design) */}
        <div style={{ position: 'absolute', left: vw(298), top: dvh(653), width: vw(97), zIndex: 3, transform: 'scaleX(-1)', transformOrigin: 'center', ...PARA }}>
          {`
M1231.81:745.2.8.`}<RedLink href="/work">22.14.17.10</RedLink>{`.938.834:756.675
  {TR

M987.457 `}
        </div>

        {/* ░▒▓▓▒░ mirrored block — Figma 186:38 */}
        <div style={{ position: 'absolute', left: vw(293), top: dvh(757), width: vw(102), zIndex: 3, transform: 'scaleX(-1)', transformOrigin: 'center', ...PARA }}>
          {` ░▒▓▓▒░ 740.02.73MΔ1053.46Λ80`}<RedLink href="/listen">1181819413</RedLink>{`
1■1024.35  779.509  1021.73  76`}
        </div>

        {/* send transmission — Figma 186:39: 33.648px / -0.13em (LOCKED), y=824 */}
        <Link href="/transmit" style={{
          position: 'absolute', left: vw(31), top: dvh(824),
          fontFamily: DISPLAY, fontSize: vw(33.65), lineHeight: 0.97, letterSpacing: '-0.13em',
          color: '#000', textDecoration: 'none', whiteSpace: 'nowrap', zIndex: 3,
        }}>
          {'__________send transmission'}
        </Link>

        {/* CRT scanlines — scope box only */}
        <div aria-hidden style={{
          position: 'absolute', left: vw(17), top: dvh(117), width: vw(368), height: dvh(400),
          zIndex: 7, pointerEvents: 'none',
          background: SCANLINES, opacity: 0.6,
        }} />

      </div>
    </main>
  );
}
