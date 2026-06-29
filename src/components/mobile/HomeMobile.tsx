'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { MobileScope } from '@/components/mobile/MobileScope';

const SW = 402;
const SH = 874;

const DISPLAY = 'var(--font-hn-black), "Helvetica Neue", Arial, sans-serif';
const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const SEGOE = "'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif";
const RED = '#ff0000';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.10) 3px)';

// VILLAGE word-mark cluster — positions derived from Figma node 186:3
// For unrotated letters: CSS left = Figma x, top = Figma y
// For rot=90: CSS position computed from visual center:
//   center_x = figma_x + figma_w/2, center_y = figma_y + figma_h/2
//   natural_w ≈ figma_h, natural_h ≈ figma_w (dimensions swap when rotated)
//   CSS left = center_x - natural_w/2, top = center_y - natural_h/2
const LOGO_LETTERS: { t: string; x: number; y: number; rot: number; flipY: boolean }[] = [
  { t: 'E',    x: 143, y: 568, rot: 0,   flipY: false }, // tall E, Figma (142.7,568)
  { t: 'E',    x: 159, y: 599, rot: 90,  flipY: false }, // Figma visual center (172,622)
  { t: 'E',    x: 130, y: 585, rot: 90,  flipY: false }, // Figma visual center (143,608)
  { t: 'VGE',  x: 149, y: 674, rot: -90, flipY: true  }, // Figma visual center (175,697)
  { t: 'VILL', x: 161, y: 615, rot: 0,   flipY: true  }, // Figma (160.6,614.7)
  { t: 'E',    x: 140, y: 670, rot: 90,  flipY: false }, // Figma visual center (154,693)
  { t: 'VGE',  x: 155, y: 647, rot: 90,  flipY: false }, // Figma visual center (181,670)
];

// IMG_2411 oval marks — x=145 for all, y values sorted from Figma node 186:3
const LOGO_OVAL_TOPS = [577, 613, 619, 624, 630, 635, 641, 651, 652, 653];
const LOGO_OVAL_X = 145;
const LOGO_OVAL = 15;

const PARA: React.CSSProperties = {
  fontFamily: BODY, fontSize: 11, lineHeight: 1.22,
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
  const [scale, setScale] = useState(1);
  const [centerY, setCenterY] = useState<number | null>(null);
  const [clock, setClock] = useState(() => buildClock(new Date()));
  const [ticker, setTicker] = useState(() => hexLine(0));

  useEffect(() => {
    const update = () => {
      const vp = window.visualViewport;
      const vw = vp?.width ?? window.innerWidth;
      const vh = vp?.height ?? window.innerHeight;
      const offsetTop = vp?.offsetTop ?? 0;
      setScale(vw / SW);
      setCenterY(offsetTop + vh / 2);
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

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
      <div
        className="page-enter"
        style={{
          position: 'absolute', left: '50%',
          top: centerY !== null ? centerY : '50%',
          width: SW, height: SH,
          transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center center',
        }}
      >
        {/* README — top-left label, links to /information */}
        <Link href="/information" style={{
          position: 'absolute', left: 35, top: 52, fontFamily: SEGOE, fontSize: 11,
          lineHeight: '11px', color: '#000', textDecoration: 'none',
        }}>README</Link>

        {/* Chromeless vectorscope — black-outline signal artifact */}
        <div style={{ position: 'absolute', left: 17, top: 117, width: 368, height: 400 }}>
          <MobileScope width={368} height={400} />
        </div>

        {/* Broadcast status — top-left of the scope box */}
        <div style={{
          position: 'absolute', left: 24, top: 124, width: 320,
          fontFamily: BODY, fontSize: 11, lineHeight: '11px', textTransform: 'uppercase',
          color: '#000', zIndex: 3, pointerEvents: 'none',
        }}>
          {'> BROADCAST '}
          <span style={{ color: RED }}>[LIVE]</span>
          <span style={{ color: RED, animation: 'vr-blink 1s step-end infinite' }}> █</span>
        </div>

        {/* Timecode — top-right inside the scope box */}
        <div style={{
          position: 'absolute', left: 285, top: 125, width: 92,
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
          position: 'absolute', left: 17, top: 523, width: 368, height: 14,
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
            style={{ position: 'absolute', left: LOGO_OVAL_X, top: t, width: LOGO_OVAL, height: LOGO_OVAL, zIndex: 4, pointerEvents: 'none' }} />
        ))}

        {/* VILLAGE word-mark cluster — letters */}
        {LOGO_LETTERS.map((l, i) => (
          <span key={`lt-${i}`} aria-hidden style={{
            position: 'absolute', left: l.x, top: l.y, fontFamily: DISPLAY, fontSize: 34,
            lineHeight: 1, color: '#000', zIndex: 4, whiteSpace: 'nowrap',
            transform: `rotate(${l.rot}deg) scaleY(${l.flipY ? -1 : 1})`, transformOrigin: 'center',
          }}>{l.t}</span>
        ))}

        {/* Main structure paragraph — Figma 186:3 x=197.8, y=614.9, w=182 */}
        <div style={{ position: 'absolute', left: 198, top: 603, width: 182, zIndex: 3, ...PARA }}>
          {`[STRUCTURE_01:VOID]
  0X1440X // STNSION
  <RECT:FILL_NULL>
   987.4 `}<RedLink href="/listen">1181819413</RedLink>{` 57-740.093-X:804.608_CONST_Y
1053.031.95⌠1028.6Λ804.60⌠1028.44793.1■1024.351053.46Λ804Σ1
031.95⌠1028.44793.1024.35  77`}<RedLink href="/photography">15 7 14 19 14 6 17 0 15 7 24</RedLink>{`9.509  1021.73■  1   7  1021.73  7779.509/768.364/759.846  //
E
  </PATH_NULL>`}
        </div>

        {/* "0X228" — Figma 186:3 x=315, y=635, w=36 */}
        <div aria-hidden style={{
          position: 'absolute', left: 315, top: 623, width: 36, zIndex: 3,
          transform: 'scaleX(-1)', transformOrigin: 'center', ...PARA,
        }}>
          {'0X228 '}
        </div>

        {/* Censor bar 1 — wide bar covering paragraph + right column */}
        <div aria-hidden style={{
          position: 'absolute', left: 195, top: 660, width: 156, height: 9,
          background: '#000', zIndex: 5,
        }} />

        {/* Censor bar 2 — narrow bar */}
        <div aria-hidden style={{
          position: 'absolute', left: 250, top: 689, width: 46, height: 9,
          background: '#000', zIndex: 5,
        }} />

        {/* M1231 mirrored block */}
        <div style={{ position: 'absolute', left: 298, top: 641, width: 97, zIndex: 3, transform: 'scaleX(-1)', transformOrigin: 'center', ...PARA }}>
          {`M1231.81:745.2.8.`}<RedLink href="/work">22.14.17.10</RedLink>{`.938.834:756.675
  {TRANS_LAYER:000:000:000}
  /SIG_PATH_END

M987.457`}
        </div>

        {/* ░▒▓▓▒░ mirrored block */}
        <div style={{ position: 'absolute', left: 293, top: 745, width: 102, zIndex: 3, transform: 'scaleX(-1)', transformOrigin: 'center', ...PARA }}>
          {` ░▒▓▓▒░ 740.093HΩ1032.73MΔ1053.46Λ80`}<RedLink href="/news">13 4 22 18</RedLink>{`
134.608Σ10.31.95⌠1028.44793.1■1024.35  779.509  1021.73  76
8.364  1020.56  759.846  1019.39`}
        </div>

        {/* send transmission — fontSize:32 and letterSpacing:'-0.13em' are LOCKED */}
        <Link href="/transmit" style={{
          position: 'absolute', left: 31, top: 824,
          fontFamily: DISPLAY, fontSize: 32, lineHeight: '31px', letterSpacing: '-0.13em',
          color: '#000', textDecoration: 'none', whiteSpace: 'nowrap', zIndex: 3,
        }}>
          {'__________send transmission'}
        </Link>

        {/* CRT scanlines — scope box only */}
        <div aria-hidden style={{
          position: 'absolute', left: 17, top: 117, width: 368, height: 400,
          zIndex: 7, pointerEvents: 'none',
          background: SCANLINES, opacity: 0.6,
        }} />
      </div>
    </main>
  );
}
