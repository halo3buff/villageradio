'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShannonDiagram } from '@/components/ShannonDiagram';
import type { NavCommand } from '@/lib/types';
import { grantClearance } from '@/lib/clearance';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

/**
 * Temporary homepage while the rest is rebuilt: nothing but the Shannon
 * diagram centred, README top-right and the command prompt bottom-left.
 * The real composition still lives in HomeShell — swap it back in
 * src/app/page.tsx when it's ready.
 */
export function HomeTemp({ commands }: { commands: NavCommand[] }) {
  const cmdMap = Object.fromEntries(commands.filter(c => !c.blocked).map(c => [c.cmd, c.route]));
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [cmd, setCmd] = useState('');
  const [echo, setEcho] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [kbShift, setKbShift] = useState(0);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // Mobile keyboard covers a bottom-left prompt — slide the screen up by the
  // occluded height while it's open (>120px filters out pinch-zoom).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!focused || !vv) { setKbShift(0); return; }
    const update = () => {
      const occluded = document.documentElement.clientHeight - vv.height;
      setKbShift(occluded < 120 ? 0 : occluded);
    };
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, [focused]);

  // iOS Smart Punctuation curls straight quotes, which would break '.. and ^^' forever.
  const normalise = (raw: string) =>
    raw.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+$/, '');

  const onChange = (raw: string) => {
    if (echo) return; // frozen while a command executes
    const value = normalise(raw);
    const target = cmdMap[value];
    if (!target) { setCmd(raw); return; }
    setCmd(value);
    setEcho(target);
    grantClearance(target); // a correct command IS the checkpoint pass
    inputRef.current?.blur();
    timers.current.push(setTimeout(() => router.push(target), 450));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || echo) return;
    const value = cmd.trim();
    if (!value) return;
    const code = Array.from(value)
      .reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 7)
      .toString(16).padStart(4, '0').toUpperCase();
    setErr(`SIG_UNKNOWN 0x${code}`);
    setCmd('');
    timers.current.push(setTimeout(() => setErr(null), 1600));
  };

  return (
    <main style={{
      position: 'fixed', inset: 0, overflow: 'hidden',
      background: 'var(--vlg-bg, #fff)', color: 'var(--vlg-fg, #000)',
      transform: `translateY(${-kbShift}px)`, transition: 'transform 0.3s ease',
    }}>
      {/* README — top-right */}
      <Link href="/information" style={{
        position: 'absolute', top: 24, right: 24, zIndex: 2,
        fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em',
        color: 'var(--vlg-fg, #000)', textDecoration: 'none',
      }}>README</Link>

      {/* Information source — dead centre */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(880px, 88vw)', aspectRatio: '880 / 330', pointerEvents: 'none',
      }}>
        <ShannonDiagram />
      </div>

      {/* Command prompt — bottom-left. Visible row mirrors a transparent
          <input> (needed to summon the mobile keyboard); tap anywhere to focus. */}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          position: 'absolute', left: 24, bottom: 24, width: 'min(340px, 80vw)', height: 40,
          zIndex: 2, cursor: 'text',
        }}
      >
        {err && (
          <div aria-hidden style={{
            position: 'absolute', left: 0, top: -8,
            fontFamily: MONO, fontSize: 10, lineHeight: '14px', whiteSpace: 'pre', pointerEvents: 'none',
          }}>{err}</div>
        )}
        <div aria-hidden style={{
          position: 'absolute', left: 0, top: 10,
          fontFamily: MONO, fontSize: 13, lineHeight: '20px', whiteSpace: 'pre', pointerEvents: 'none',
        }}>
          {'> '}{cmd}
          {echo ? (
            <span style={{ color: '#ff0000' }}>{'  ->  '}{echo}</span>
          ) : (
            <span style={{
              display: 'inline-block', width: 8, height: 14, background: 'var(--vlg-cmd-cursor, #000)',
              verticalAlign: '-2px', animation: 'vr-blink 1s step-end infinite',
            }} />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={cmd}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label="command"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 16, // >=16 keeps iOS from zooming on focus
          }}
        />
      </div>
    </main>
  );
}
