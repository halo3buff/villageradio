'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { NavCommand } from '@/lib/types';
import type { FeedLine } from '@/lib/content/log';
import { grantClearance } from '@/lib/clearance';
import { PASSPHRASE, SPRITE_WORD, SSBRO_WORD } from '@/lib/passphrases';

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
// Tournament sets (Big House, EVO, Genesis). `at`: seconds checked frame by frame (every 10s from
// the point to 50s after it) to stay in-match, never crowd, players, commentary desk or results. `c`: the game's horizontal centre in the stream layout (0.5 = centred;
// ~0.66 when a webcam/sponsor column sits left), so the TV can frame just the game.
const SSBRO_CLIPS: { id: string; c: number; at?: number[]; d?: number }[] = [
  { id: 'cqM92Lf0IJc', c: 0.5, at: [958, 1277, 1597] },
  { id: 'VVreFdWcze4', c: 0.66, at: [994, 2981, 4969, 6956, 7950] },
  { id: 'Oime4m6suCo', c: 0.5, at: [356, 475, 713, 950] },
  { id: 'U2cd_pFdQUk', c: 0.67, at: [238, 594] },
  { id: '_OVP0Z9xF7M', c: 0.5, at: [273, 546, 819] },
  { id: 'T6aixSUxpVA', c: 0.66, at: [135, 405, 674, 809] },
  { id: '6dd4-gj4_HQ', c: 0.66, at: [640, 960, 1600, 1920] },
  // Slippi / netplay uploads: straight game capture, no cams, so any point a little in is gameplay. `d`: length (s).
  { id: '_Shvf82KJ60', c: 0.5, d: 460 },
  { id: '0KvgRCJdKqE', c: 0.5, d: 259 },
  { id: '1oqFACIzVh8', c: 0.5, d: 276 },
  { id: '1z6Iy6yrmRU', c: 0.5, d: 313 },
  { id: '1ZFHkZpIXUE', c: 0.5, d: 283 },
  { id: '5hlEQeC7UA4', c: 0.5, d: 302 },
  { id: '5YxGaHJsR4k', c: 0.5, d: 323 },
  { id: '6D1J9GmtU3Y', c: 0.5, d: 3901 },
  { id: '6yaKaEPH-vU', c: 0.5, d: 337 },
  { id: 'aqZgAm_iFHc', c: 0.5, d: 1429 },
  { id: 'bDwPuz_J7sc', c: 0.5, d: 383 },
  { id: 'epG4KA2PWX8', c: 0.5, d: 5290 },
  { id: 'EwBfv0Aw49s', c: 0.5, d: 505 },
  { id: '-fgsFxPXGhM', c: 0.5, d: 559 },
  { id: 'g54oy7oxT7A', c: 0.5, d: 625 },
  { id: 'GJ0mr05NY5E', c: 0.5, d: 481 },
  { id: 'GLAbJOL19dU', c: 0.5, d: 486 },
  { id: 'h2xZsfYuPKc', c: 0.5, d: 1720 },
  { id: 'H-7Cbgmvqxw', c: 0.5, d: 473 },
  { id: 'i5DIhK0zNhY', c: 0.5, d: 1203 },
  { id: 'IaX2qozqb6k', c: 0.5, d: 387 },
  { id: 'NbXC5jqGVHk', c: 0.5, d: 698 },
  { id: 'OI54vTInWQg', c: 0.5, d: 400 },
  { id: 'ojD_H7T_lXk', c: 0.5, d: 499 },
  { id: 'OvxUBxS8w7c', c: 0.5, d: 3202 },
  { id: 'pJORAumqGjM', c: 0.5, d: 542 },
  { id: 'pU-oS4oL3NI', c: 0.5, d: 630 },
  { id: 'QZzzLw1SIVE', c: 0.5, d: 484 },
  { id: 'RS9NmmeQnJY', c: 0.5, d: 522 },
  { id: 'RXVXv49HTDc', c: 0.5, d: 1501 },
  { id: 's7S_714-VPY', c: 0.5, d: 472 },
  { id: 'T1ANvjuvY20', c: 0.5, d: 585 },
  { id: 'TxGOoF4gOrk', c: 0.5, d: 495 },
  { id: 'Tykl8McBPew', c: 0.5, d: 548 },
  { id: 'v2SXE9uVOoc', c: 0.5, d: 995 },
  { id: 'weJMWr0JrMw', c: 0.5, d: 3219 },
  { id: 'xogYys3X0pA', c: 0.5, d: 332 },
  { id: 'YcJd5DvWbKI', c: 0.5, d: 601 },
  { id: 'Z0OBHUH8c_c', c: 0.5, d: 3563 },
];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const startOf = (c: (typeof SSBRO_CLIPS)[number]) => c.at ? pick(c.at) : Math.floor(15 + Math.random() * Math.max(1, c.d! - 75));
const CHANNEL_MS = 45_000;   // every point is checked to stay in-match for 50s; the TV changes channel before that runs out
// no controls, no keyboard, loops; the JS API lets a tap on the screen toggle sound
const ssbroSrc = (id: string, start: number) =>
  `https://www.youtube.com/embed/${id}?start=${start}&autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&cc_load_policy=0&rel=0&playsinline=1&enablejsapi=1`;

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
  const [clip, setClip] = useState<{ clip: (typeof SSBRO_CLIPS)[number]; at: number } | null>(null);
  const [sound, setSound] = useState(false);
  const tvRef = useRef<HTMLIFrameElement>(null);
  const fails = useRef(0);          // clips in a row that never got going (YouTube's "confirm you're not a bot" page)
  const [noSignal, setNoSignal] = useState(false);
  const toggleSound = () => {
    tvRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: sound ? 'mute' : 'unMute', args: [] }), '*');
    setSound(!sound);
  };
  // Boot screen: the station's spinning mark covers the TV while the player starts and while it jumps
  // to a match point, and stays up until playback is 4s past that point. That hides YouTube's title,
  // spinner and the pause/play flash a seek triggers. Every CHANNEL_MS it jumps to another match point,
  // behind the boot screen again. The player reports currentTime over postMessage once told we're
  // listening. If it never plays (YouTube's bot check, a pulled video) the logo stays up and another
  // clip is tried; after three misses the TV shows NO SIGNAL rather than YouTube's page.
  const [boot, setBoot] = useState(false);
  useEffect(() => {
    if (!clip) return;
    const send = (func: string, args: unknown[]) =>
      tvRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    let target = clip.at;
    let covered = false;
    let fallback: ReturnType<typeof setTimeout>;
    const uncover = () => { covered = false; fails.current = 0; setBoot(false); clearTimeout(fallback); };
    const retune = () => {
      if (++fails.current >= 3) { setNoSignal(true); return; }
      const c = pick(SSBRO_CLIPS);
      setClip({ clip: c, at: startOf(c) });
    };
    const cover = () => { covered = true; setBoot(true); clearTimeout(fallback); fallback = setTimeout(retune, 12000); };
    const hideCaptions = () => { send('unloadModule', ['captions']); send('setOption', ['captions', 'track', {}]); };
    cover();
    const channel = setInterval(() => {
      target = startOf(clip.clip);
      cover();
      send('seekTo', [target, true]);
    }, CHANNEL_MS);
    const onMsg = (e: MessageEvent) => {
      if (!e.origin.includes('youtube')) return;
      try {
        const info = JSON.parse(e.data)?.info;
        if (info?.currentTime == null || !covered) return;
        hideCaptions();   // some uploads force captions on; the module can load late, so keep dropping it while covered
        if (info.currentTime > target + 4) uncover();
      } catch {}
    };
    window.addEventListener('message', onMsg);
    return () => { window.removeEventListener('message', onMsg); clearTimeout(fallback); clearInterval(channel); };
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
      fails.current = 0;
      setNoSignal(false);
      const c = pick(SSBRO_CLIPS);
      setClip({ clip: c, at: startOf(c) });
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
      <div className="ssbro-tv" style={{
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
          <iframe ref={tvRef} src={ssbroSrc(clip.clip.id, clip.at)} title="Super Smash Bros. Melee gameplay" allow="autoplay; encrypted-media"
            onLoad={() => tvRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')}
            // zoomed so the 4:3 game fills the screen, panned to the game's centre in this set's stream layout
            style={{ position: 'absolute', top: '50%', left: `${50 - clip.clip.c * 150}%`, width: '150%', height: '112.5%', transform: 'translateY(-50%)', border: 'none', pointerEvents: 'none' }} />
          {boot && (
            <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {noSignal
                ? <span style={{ color: '#fff' }}>NO SIGNAL</span>
                // eslint-disable-next-line @next/next/no-img-element -- animated, served as is
                : <img src="/site_assets/logo_roto_v4.webp" alt="" style={{ width: '45%', filter: 'brightness(0) invert(1)' }} />}
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
