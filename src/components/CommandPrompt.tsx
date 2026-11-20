'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { NavCommand } from '@/lib/types';
import type { FeedLine } from '@/lib/content/log';
import { grantClearance } from '@/lib/clearance';

/** Offer the keyed line and its response to the station log (HomeDesktop listens on /station).
 *  True when a log took them — the floating line above the prompt then stays quiet. */
function toLog(lines: Omit<FeedLine, 'at'>[]): boolean {
  const at = Date.now();
  return !window.dispatchEvent(new CustomEvent<FeedLine[]>('vlg:cmdfeed', {
    cancelable: true,
    detail: lines.map((l, i) => ({ at: at + i, ...l })),
  }));
}

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
// The prompt's "file" is the page you're on; anything unlisted shows its own last segment.
const FILES: Record<string, string> = {
  '/': 'landing', '/station': 'broadcast', '/information': 'README_0', '/station/readme': 'README_1', '/station/radar': 'radar',
};
const ps1 = (path: string) => `MAIN:/vlg/stn/${FILES[path] ?? path.split('/').pop()} > `;

/**
 * The station's command line — one instance, mounted by SiteFrame, fixed at the
 * same spot on every page. Sits above the lock screen (z 2000) and the README
 * overlay (z 1000) so it is always the thing you can type into.
 *
 * Visible row mirrors a transparent <input> (needed to summon the mobile
 * keyboard); tap anywhere along it to focus.
 */
// Not in the CMS command list, so they never appear on the README or in admin.
const PASSPHRASE: Record<string, string> = {
  gulam: '/station', farm: '/farm', recky: '/rec',
  Sunbird: '/station/radar', sunbird: '/station/radar',   // phones capitalise the first letter
};
// The admin entry for phones, which have no arrow keys: summons SootSprite's sprite, homepage only.
const SPRITE_WORD = 'honeycomb';
// Easter egg: opens a small window of Brawl gameplay — YouTube's own embed player, nothing hosted here.
const SSBRO_WORD = 'ssbro';
const SSBRO_CLIPS = ['lluwqYj4V70', 'f7C83j8EQcw', '9DoGVa8_q5c', 's-l6UkYX_Ns'];

export function CommandPrompt({ commands }: { commands: NavCommand[] }) {
  const cmdMap = {
    ...Object.fromEntries(commands.filter(c => !c.blocked).map(c => [c.cmd, c.route])),
    ...PASSPHRASE,
  };
  const router = useRouter();
  const pathname = usePathname();
  const PS1 = ps1(pathname);
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [cmd, setCmd] = useState('');
  const [echo, setEcho] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [kbShift, setKbShift] = useState(0);
  const [clip, setClip] = useState<string | null>(null);
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
  // published so the station log can ride up with the prompt
  useEffect(() => { document.documentElement.style.setProperty('--kb', `${kbShift}px`); }, [kbShift]);

  // iOS Smart Punctuation curls straight quotes, which would break '.. and ^^' forever.
  const normalise = (raw: string) =>
    raw.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+$/, '');

  const onChange = (raw: string) => {
    if (echo) return; // frozen while a command executes
    const value = normalise(raw);
    if (value.toLowerCase() === SPRITE_WORD && pathname === '/') {
      setCmd('');
      inputRef.current?.blur();
      window.dispatchEvent(new Event('vlg:sprite'));
      return;
    }
    if (value.toLowerCase() === SSBRO_WORD) {
      setCmd('');
      inputRef.current?.blur();
      setClip(SSBRO_CLIPS[Math.floor(Math.random() * SSBRO_CLIPS.length)]);
      return;
    }
    // housekeeping: drops what was keyed into the station log, back to the latest real lines
    if (value === '/clear') {
      setCmd('');
      window.dispatchEvent(new Event('vlg:cmdclear'));
      return;
    }
    const target = cmdMap[value];
    if (!target) { setCmd(raw); return; }
    setCmd(value);
    setEcho(target);
    toLog([{ kind: 'tx', tag: 'KBD', text: value }, { kind: 'sig', tag: 'SIG', text: `->  ${target}` }]);
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
    setCmd('');
    if (toLog([{ kind: 'tx', tag: 'KBD', text: value }, { kind: 'off', tag: 'ERR', text: `SIG_UNKNOWN 0x${code}` }])) return;
    setErr(`SIG_UNKNOWN 0x${code}`);
    timers.current.push(setTimeout(() => setErr(null), 1600));
  };

  return (<>
    {clip && (
      <div style={{
        position: 'fixed', left: 24, bottom: 'calc(clamp(10px, 2.5vw, 24px) + 56px + env(safe-area-inset-bottom, 0px))',
        width: 'min(320px, 80vw)', zIndex: 2100, fontFamily: MONO, fontSize: 10, lineHeight: '14px',
        color: 'var(--vlg-fg, #000)', background: 'var(--vlg-bg, #fff)', border: '1px solid currentColor',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', borderBottom: '1px solid currentColor' }}>
          <span>SSBRO.EXE</span>
          <button onClick={() => setClip(null)} aria-label="close"
            style={{ font: 'inherit', color: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>[x]</button>
        </div>
        {/* muted so it autoplays and doesn't talk over the radio; the player's own button unmutes */}
        <iframe src={`https://www.youtube-nocookie.com/embed/${clip}?autoplay=1&mute=1&playsinline=1&rel=0`}
          title="Super Smash Bros. Brawl gameplay" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
          style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', border: 'none' }} />
      </div>
    )}
    <div
      className="cmd-prompt"
      onClick={() => inputRef.current?.focus()}
      style={{
        // lower on phones (10px up), where the screen is short; 24px on desktop as before
        position: 'fixed', left: 24, bottom: 'calc(clamp(10px, 2.5vw, 24px) + env(safe-area-inset-bottom, 0px))', width: 'min(440px, 88vw)', height: 40,
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
          <span>{'  ->  '}{echo}</span>
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
  </>);
}
