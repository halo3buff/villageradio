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
// Easter egg: opens a small TV of Melee gameplay — YouTube's own embed player, nothing hosted here.
const SSBRO_WORD = 'ssbro';
const SSBRO_CLIPS = ['Z1ggc2qxCDg', 'ORKHzxWI6dk', 'fRONbmCVvl0', 'Oxaq-AkpOPU', '9Sdu2yjZ2xM', 'gJ3CFbwYJq8'];
// no controls, no keyboard, loops; the JS API lets a tap on the screen toggle sound
const ssbroSrc = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&cc_load_policy=0&rel=0&playsinline=1&loop=1&playlist=${id}&enablejsapi=1`;

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
  const [sound, setSound] = useState(false);
  const tvRef = useRef<HTMLIFrameElement>(null);
  const toggleSound = () => {
    tvRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: sound ? 'mute' : 'unMute', args: [] }), '*');
    setSound(!sound);
  };
  // Boot screen: the station's spinning mark covers the TV until the clip has been playing ~2.5s,
  // long enough for YouTube's title, spinner and logo to fade. The player reports 'playing' (state 1)
  // over postMessage once told we're listening; 9s is the fallback if it never says.
  const [boot, setBoot] = useState(false);
  useEffect(() => {
    if (!clip) return;
    setBoot(true);
    let lift: ReturnType<typeof setTimeout> | undefined;
    const fallback = setTimeout(() => setBoot(false), 9000);
    const onMsg = (e: MessageEvent) => {
      if (!e.origin.includes('youtube') || lift) return;
      try {
        if (JSON.parse(e.data)?.info?.playerState === 1) lift = setTimeout(() => setBoot(false), 2500);
      } catch {}
    };
    window.addEventListener('message', onMsg);
    return () => { window.removeEventListener('message', onMsg); clearTimeout(fallback); clearTimeout(lift); };
  }, [clip]);
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
      setSound(false);
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
          <span>SSBRO.EXE  {sound ? 'SND ON' : 'SND OFF'}</span>
          <button onClick={() => setClip(null)} aria-label="close"
            style={{ font: 'inherit', color: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>[x]</button>
        </div>
        {/* a vintage TV: the player is zoomed past its title bar and logo, and a glass layer on top
            takes every tap, so YouTube's pause, timeline and hover overlays never show. Tap = sound. */}
        <div style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden', background: '#000' }}>
          <iframe ref={tvRef} src={ssbroSrc(clip)} title="Super Smash Bros. Melee gameplay" allow="autoplay; encrypted-media"
            onLoad={() => tvRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')}
            style={{ position: 'absolute', top: '50%', left: '50%', width: '145%', height: '109%', transform: 'translate(-50%, -50%)', border: 'none', pointerEvents: 'none' }} />
          {boot && (
            <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- animated, served as is */}
              <img src="/site_assets/logo_roto_v4.webp" alt="" style={{ width: '45%', filter: 'brightness(0) invert(1)' }} />
            </div>
          )}
          <div onClick={toggleSound} aria-label={sound ? 'mute' : 'unmute'} role="button" style={{
            position: 'absolute', inset: 0, cursor: 'pointer',
            background: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.28) 2px 3px), radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)',
          }} />
        </div>
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
