'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NavCommand } from '@/lib/types';
import { grantClearance } from '@/lib/clearance';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PS1 = 'MAIN:/vlg/stn/broadcast > ';

/**
 * The station's command line — one instance, mounted by SiteFrame, fixed at the
 * same spot on every page. Sits above the lock screen (z 2000) and the README
 * overlay (z 1000) so it is always the thing you can type into.
 *
 * Visible row mirrors a transparent <input> (needed to summon the mobile
 * keyboard); tap anywhere along it to focus.
 */
// Not in the CMS command list, so it never appears on the README or in admin.
const PASSPHRASE: Record<string, string> = { who_is_gilgamesh: '/station' };

export function CommandPrompt({ commands }: { commands: NavCommand[] }) {
  const cmdMap = {
    ...Object.fromEntries(commands.filter(c => !c.blocked).map(c => [c.cmd, c.route])),
    ...PASSPHRASE,
  };
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [cmd, setCmd] = useState('');
  const [echo, setEcho] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [kbShift, setKbShift] = useState(0);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // Mobile keyboard covers a bottom-left prompt — lift it by the occluded
  // height while it's open (>120px filters out pinch-zoom).
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
    timers.current.push(setTimeout(() => { router.push(target); }, 450));
    timers.current.push(setTimeout(() => { setEcho(null); setCmd(''); }, 900));
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
    <div
      onClick={() => inputRef.current?.focus()}
      style={{
        position: 'fixed', left: 24, bottom: 24, width: 'min(440px, 88vw)', height: 40,
        zIndex: 2100, cursor: 'text',
        transform: `translateY(${-kbShift}px)`, transition: 'transform 0.3s ease',
      }}
    >
      {err && (
        <div aria-hidden style={{
          position: 'absolute', left: 0, top: -8,
          fontFamily: MONO, fontSize: 10, lineHeight: '14px', whiteSpace: 'pre',
          color: 'var(--vlg-fg, #000)', pointerEvents: 'none',
        }}>{err}</div>
      )}
      <div aria-hidden style={{
        position: 'absolute', left: 0, top: 10,
        fontFamily: MONO, fontSize: 13, lineHeight: '20px', whiteSpace: 'pre',
        color: 'var(--vlg-fg, #000)', pointerEvents: 'none',
      }}>
        {PS1}{cmd}
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
  );
}
