'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FitStage } from '@/components/FitStage';
import { HeaderCluster } from '@/components/HeaderCluster';
import { HtopBroadcast } from '@/components/HtopBroadcast';
import { RetroWindow, TEMPLE_BLUE } from '@/components/RetroWindow';
import { grantClearance } from '@/lib/clearance';

const MONO   = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const BODY   = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const SEGOE  = "'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif";
const RED    = '#ff0000';

// Broadcast unit — the htop-style terminal monitor, right side of the stage.
// The frame shrink-wraps its content (auto width/height, pinned 35px from the
// right edge), so the boundary stops exactly where the readout ends.
const UNIT_T = 470;

// Identical to the mobile COMMANDS map — same firewall, different surface.
const COMMANDS: Record<string, string> = {
  "'..":   '/listen',
  '2&#':   '/news',
  'ppp':   '/photography',
  '[[;]]': '/work',
  "^^'":   '/transmit',
};

type Echo = { cmd: string; path: string };

function hashInput(s: string): string {
  let h = 0x811c9dc5;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/** Desktop homepage — HeaderCluster top-left, scope + README right side, MONO command prompt. */
export function HomeDesktop() {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cmd,  setCmd]  = useState('');
  const [echo, setEcho] = useState<Echo | null>(null);
  const [err,  setErr]  = useState<string | null>(null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (echo) return;
    if (e.key !== 'Enter') return;
    const raw  = cmd.trim();
    if (!raw) return;
    const norm = raw.replace(/[\u2018\u2019]/g, "'");
    const path = COMMANDS[norm];
    if (path) {
      grantClearance(path);
      setEcho({ cmd: raw, path });
      setCmd('');
      setTimeout(() => { router.push(path); setEcho(null); }, 450);
    } else {
      setCmd('');
      setErr(`SIG_UNKNOWN 0x${hashInput(raw)}`);
      if (errTimer.current) clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setErr(null), 1600);
    }
  };

  return (
    <FitStage
      left={
        <>
          {/* Pixelate filter — samples one pixel per 5×5 cell then dilates it into
              a block, so the header art reads as low-res without moving anything. */}
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
            <filter id="vlg-pixelate">
              <feFlood x="2" y="2" height="1" width="1" />
              <feComposite width="5" height="5" />
              <feTile result="a" />
              <feComposite in="SourceGraphic" in2="a" operator="in" />
              <feMorphology operator="dilate" radius="2.5" />
            </filter>
          </svg>

          {/* Window chrome framing the header art (decorative, sits behind it) */}
          <RetroWindow
            title="VILLAGE.SYS"
            style={{
              position: 'absolute', left: 16, top: 56, width: 402, height: 300,
              zIndex: 0, pointerEvents: 'none', background: 'transparent',
            }}
          />

          {/* HeaderCluster — shifted left via xOffset so it anchors top-left.
              Cluster coords span x:1052–1440; offset -1017 moves leftmost element to x:35.
              Wrapped in a sized, pixelated layer (top offset drops the art down into
              its window; the filter clips to this box). */}
          <div style={{ position: 'absolute', left: 0, top: 50, width: 474, height: 330, filter: 'url(#vlg-pixelate)' }}>
            <HeaderCluster xOffset={-1017} />
          </div>

          {/* Window chrome framing the command prompt (decorative, behind it) */}
          <RetroWindow
            title="TERMINAL"
            style={{
              position: 'absolute', left: 8, top: 740, width: 344, height: 208,
              zIndex: 0, pointerEvents: 'none', background: 'transparent',
            }}
          />

          {/* Command prompt — MONO style, understated */}
          <div
            style={{
              position: 'absolute', left: 20, top: 906,
              pointerEvents: 'auto', cursor: 'text',
              fontFamily: MONO, fontSize: 16, lineHeight: 1,
              letterSpacing: '0.04em', color: 'var(--vlg-fg, #000)',
              whiteSpace: 'nowrap', userSelect: 'none',
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {echo ? (
              <span style={{ color: RED }}>
                {'> '}{echo.cmd}{'  ->  '}{echo.path}
              </span>
            ) : err ? (
              <span style={{ fontFamily: BODY, fontSize: 11, letterSpacing: '0.05em' }}>
                {err}
              </span>
            ) : (
              <>
                {'> '}
                <span>{cmd}</span>
                <span style={{
                  display: 'inline-block',
                  width: '0.55em', height: '0.9em',
                  background: 'var(--vlg-cmd-cursor, #000)', verticalAlign: '-0.1em',
                  animation: 'vr-blink 1s step-end infinite',
                }} />
              </>
            )}
            <input
              ref={inputRef}
              value={cmd}
              onChange={e => { if (!echo) setCmd(e.target.value); }}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              style={{
                position: 'absolute', opacity: 0, pointerEvents: 'none',
                left: 0, top: 0, width: 1, height: 1,
              }}
            />
          </div>
        </>
      }
      right={
        <>
          {/* README — top-right corner, 35px from right edge */}
          <Link
            href="/information"
            style={{
              position: 'absolute', right: 35, top: 35,
              fontFamily: SEGOE, fontSize: 11, lineHeight: '11px',
              color: 'var(--vlg-fg, #000)', textDecoration: 'none', pointerEvents: 'auto',
            }}
          >
            README
          </Link>

          {/* Broadcast unit — the htop-style monitor, framed in retro window
              chrome. The var overrides re-skin everything inside: MONO → VT323
              bitmap face, ink → Temple blue. */}
          <div
            style={{
              position: 'absolute', right: 35, top: UNIT_T,
              '--font-ibm-plex-mono': 'var(--font-ibm-vga)',
              '--vlg-fg': TEMPLE_BLUE,
              '--vlg-strong': '#08087a',
            } as React.CSSProperties}
          >
            <RetroWindow title="BROADCAST" bodyPad={16}>
              <HtopBroadcast />
            </RetroWindow>
          </div>
        </>
      }
    />
  );
}
