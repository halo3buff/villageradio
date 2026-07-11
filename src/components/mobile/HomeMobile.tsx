'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MobileScope } from '@/components/mobile/MobileScope';
import { BroadcastLiveTag } from '@/components/BroadcastLiveTag';
import type { NavCommand } from '@/lib/types';
import { grantClearance } from '@/lib/clearance';

/**
 * Figma frame is 402pt wide (iPhone 17). The entire composition is laid out in
 * design pixels on a fixed-size canvas, then uniformly scaled with a single
 * WIDTH-driven factor (layoutViewportW/402) so it always fills the full screen
 * width with zero side padding and proportions identical to Figma. If the
 * scaled canvas is taller than the visible viewport the page scrolls naturally.
 * Never mix vw/dvh per-axis units here: dynamic viewport height shrinks under
 * browser chrome and squashes everything vertically.
 *
 * SH is the canvas height: Figma's 874 minus 160px of trimmed open space so
 * the whole composition fits a phone viewport with no scrolling.
 */
const SW = 402;
const SH = 714;

const DISPLAY = 'var(--font-hn-black), "Helvetica Neue", Arial, sans-serif';
const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const RED = '#ff0000';
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.10) 3px)';

// Shift for the decorative word-mark cluster (jumbled letters + ovals)
// relative to the Figma-frame coordinates: up with the page compression,
// and over to the right side so it stays out of the middle.
const CLUSTER_DY = -82;
const CLUSTER_DX = 130;

// Command prompt geometry (design px) — also used to slide the canvas up
// when the mobile keyboard would cover the prompt.
const PROMPT_LEFT = 31;
const PROMPT_TOP = 660;
const PROMPT_H = 40;


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

export function HomeMobile({ commands }: { commands: NavCommand[] }) {
  const cmdMap = Object.fromEntries(commands.map(c => [c.cmd, c.route]));
  const scale = useUniformScale();
  const router = useRouter();
  const [clock, setClock] = useState(() => buildClock(new Date()));
  const [ticker, setTicker] = useState(() => hexLine(0));
  const [cmd, setCmd] = useState('');
  const [cmdFocused, setCmdFocused] = useState(false);
  const [kbShift, setKbShift] = useState(0);
  // Echo-before-jump: the resolved path shown after a correct command while
  // navigation is briefly held back (input frozen during the echo).
  const [echo, setEcho] = useState<string | null>(null);
  // Mute-but-not-dead error: decaying SIG_UNKNOWN line above the prompt.
  const [err, setErr] = useState<{ text: string; key: number } | null>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  // The page cannot scroll, and iOS only reveals a covered input after the
  // first keystroke — so when the keyboard opens, slide the whole canvas up
  // just enough that the prompt sits above it. The visualViewport listener is
  // active ONLY while the prompt is focused, and only reacts to keyboard-sized
  // occlusion (>120px), so pinch-zoom can't retrigger the old jump bug.
  useEffect(() => {
    if (!cmdFocused || scale === null) { setKbShift(0); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const occluded = document.documentElement.clientHeight - vv.height;
      if (occluded < 120) { setKbShift(0); return; }
      const promptBottom = (PROMPT_TOP + PROMPT_H) * scale;
      setKbShift(Math.max(0, promptBottom - vv.height + 16));
    };
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, [cmdFocused, scale]);

  // Exact command match → echo the resolved path, hold ~450ms, then navigate
  // (feels like the machine executed something, not a link firing). iOS
  // "Smart Punctuation" turns straight quotes into curly ones (' → ’), which
  // would break '.. and ^^' forever, so normalise them back before matching.
  const onCmdChange = (raw: string) => {
    if (echo) return; // input frozen while a command executes
    const value = raw.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+$/, '');
    const target = cmdMap[value];
    if (target) {
      setCmd(value);
      setEcho(target);
      grantClearance(target); // a correct command IS the checkpoint pass
      cmdInputRef.current?.blur();
      timersRef.current.push(setTimeout(() => router.push(target), 450));
    } else {
      setCmd(raw);
    }
  };

  // Enter on a wrong string: print a decaying SIG_UNKNOWN line above the
  // prompt and swallow the attempt. Rewards experimentation, explains nothing.
  const onCmdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || echo) return;
    const value = cmd.trim();
    if (!value) return;
    const code = Array.from(value)
      .reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 7)
      .toString(16).padStart(4, '0').toUpperCase();
    setErr({ text: `SIG_UNKNOWN 0x${code}`, key: Date.now() });
    setCmd('');
    // Hold the line solid for a beat, then cut it — no fade
    timersRef.current.push(setTimeout(() => setErr(null), 1600));
  };

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
      // Slide up while the keyboard covers the command prompt
      transform: `translateY(${-kbShift}px)`,
      transition: 'transform 0.3s ease',
    }}>
      <div className="page-enter" style={{
        position: 'absolute', left: 0, top: 0,
        width: SW, height: SH,
        transform: `scale(${scale ?? 1})`, transformOrigin: 'top left',
        visibility: scale === null ? 'hidden' : 'visible',
      }}>

        {/* README — top-right, links to /information; same face as the info page */}
        <Link href="/information" style={{
          position: 'absolute', left: 315, top: 28,
          fontFamily: MONO, fontSize: 11, lineHeight: '12px',
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
          <BroadcastLiveTag />
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
              position: 'absolute', left: LOGO_OVAL_X + CLUSTER_DX, top: t + CLUSTER_DY,
              width: LOGO_OVAL, height: LOGO_OVAL,
              zIndex: 4, pointerEvents: 'none',
            }} />
        ))}

        {/* VILLAGE word-mark cluster — letters */}
        {LOGO_LETTERS.map((l, i) => (
          <span key={`lt-${i}`} aria-hidden style={{
            position: 'absolute', left: l.x + CLUSTER_DX, top: l.y + CLUSTER_DY,
            fontFamily: DISPLAY, fontSize: 34,
            lineHeight: 1, color: '#000', zIndex: 4, whiteSpace: 'nowrap',
            transform: `rotate(${l.rot}deg) scaleY(${l.flipY ? -1 : 1})`, transformOrigin: 'center',
          }}>{l.t}</span>
        ))}

        {/* Command prompt — the only usable thing under the vectorscope.
            The visible row is a rendered mirror of a transparent <input>
            (needed to summon the mobile keyboard); tapping anywhere on the
            row focuses it. Exact command → navigate (see COMMANDS). */}
        <div
          onClick={() => cmdInputRef.current?.focus()}
          style={{
            position: 'absolute', left: PROMPT_LEFT, top: PROMPT_TOP, width: 340, height: PROMPT_H,
            zIndex: 3, cursor: 'text',
          }}
        >
          {/* Error line — holds solid above the prompt, then vanishes outright */}
          {err && (
            <div key={err.key} aria-hidden style={{
              position: 'absolute', left: 0, top: -8,
              fontFamily: MONO, fontSize: 10, lineHeight: '14px', color: '#000',
              whiteSpace: 'pre', pointerEvents: 'none',
            }}>{err.text}</div>
          )}
          <div aria-hidden style={{
            position: 'absolute', left: 0, top: 10,
            fontFamily: MONO, fontSize: 13, lineHeight: '20px', color: '#000',
            whiteSpace: 'pre', pointerEvents: 'none',
          }}>
            {'> '}{cmd}
            {echo ? (
              // Executing: cursor stops, the resolved path is echoed.
              <span style={{ color: RED }}>{'  ->  '}{echo}</span>
            ) : (
              /* Cursor is a plain rectangle — U+2588 is missing from the IBM Plex Mono subset. */
              <span style={{
                display: 'inline-block', width: 8, height: 14, background: '#000',
                verticalAlign: '-2px', animation: 'vr-blink 1s step-end infinite',
              }} />
            )}
          </div>
          <input
            ref={cmdInputRef}
            type="text"
            value={cmd}
            onChange={e => onCmdChange(e.target.value)}
            onKeyDown={onCmdKeyDown}
            onFocus={() => setCmdFocused(true)}
            onBlur={() => setCmdFocused(false)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-label="command"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              opacity: 0, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 16, // ≥16 belt-and-braces against iOS focus zoom
            }}
          />
        </div>

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
