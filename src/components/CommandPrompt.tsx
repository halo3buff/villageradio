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
// Tournament sets (Big House, EVO, Genesis). `at`: seconds checked frame by frame (every 10s from
// the point to 50s after it) to stay in-match, never crowd, players, commentary desk or results. `c`: the game's horizontal centre in the stream layout (0.5 = centred;
// ~0.66 when a webcam/sponsor column sits left), so the TV can frame just the game.
const SSBRO_CLIPS: { id: string; c: number; at: number[] }[] = [
  { id: 'cqM92Lf0IJc', c: 0.5, at: [958, 1277, 1597] },
  { id: 'VVreFdWcze4', c: 0.66, at: [994, 2981, 4969, 6956, 7950] },
  { id: 'Oime4m6suCo', c: 0.5, at: [356, 475, 713, 950] },
  { id: 'U2cd_pFdQUk', c: 0.67, at: [238, 594] },
  { id: '_OVP0Z9xF7M', c: 0.5, at: [273, 546, 819] },
  { id: 'T6aixSUxpVA', c: 0.66, at: [135, 405, 674, 809] },
  { id: '6dd4-gj4_HQ', c: 0.66, at: [640, 960, 1600, 1920] },
];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
// Easter egg: playable Melee. The author's own hosted page (nikhilunni/melee, a Rust/WebGPU port with
// no game data) in a window; each player drops in their own disc image, read in their browser only.
// Nothing is copied here: the repo has no licence, so it is framed, not rebuilt.
const MELEE_WORD = 'melee';
const MELEE_URL = 'https://nikhilunni.github.io/melee/';
const CHANNEL_MS = 45_000;   // every point is checked to stay in-match for 50s; the TV changes channel before that runs out
// no controls, no keyboard, loops; the JS API lets a tap on the screen toggle sound
const ssbroSrc = (id: string, start: number) =>
  `https://www.youtube-nocookie.com/embed/${id}?start=${start}&autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&cc_load_policy=0&rel=0&playsinline=1&enablejsapi=1`;

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
  const [melee, setMelee] = useState(false);
  const tvRef = useRef<HTMLIFrameElement>(null);
  const toggleSound = () => {
    tvRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: sound ? 'mute' : 'unMute', args: [] }), '*');
    setSound(!sound);
  };
  // Boot screen: the station's spinning mark covers the TV while the player starts and while it jumps
  // to a match point, and stays up until playback is 4s past that point. That hides YouTube's title,
  // spinner and the pause/play flash a seek triggers. Every CHANNEL_MS it jumps to another match point,
  // behind the boot screen again. The player reports currentTime over postMessage once told we're
  // listening; 12s is the fallback if it never does.
  const [boot, setBoot] = useState(false);
  useEffect(() => {
    if (!clip) return;
    const send = (func: string, args: unknown[]) =>
      tvRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    let target = clip.at;
    let covered = false;
    let fallback: ReturnType<typeof setTimeout>;
    const uncover = () => { covered = false; setBoot(false); clearTimeout(fallback); };
    const cover = () => { covered = true; setBoot(true); clearTimeout(fallback); fallback = setTimeout(uncover, 12000); };
    const hideCaptions = () => { send('unloadModule', ['captions']); send('setOption', ['captions', 'track', {}]); };
    cover();
    const channel = setInterval(() => {
      target = pick(clip.clip.at);
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
      const c = pick(SSBRO_CLIPS);
      setClip({ clip: c, at: pick(c.at) });
      return;
    }
    if (value.toLowerCase() === MELEE_WORD) {
      setCmd('');
      inputRef.current?.blur();
      setClip(null);   // one Melee at a time
      setMelee(true);
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
    {melee && (
      <div style={{
        position: 'fixed', inset: 'min(5vh, 40px) min(5vw, 40px)', zIndex: 2200, display: 'flex', flexDirection: 'column',
        fontFamily: MONO, fontSize: 10, lineHeight: '14px', color: 'var(--vlg-fg, #000)', background: '#000', border: '1px solid currentColor',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', borderBottom: '1px solid currentColor', background: 'var(--vlg-bg, #fff)' }}>
          <span>MELEE.EXE  NEEDS YOUR OWN NTSC 1.02 DISC IMAGE · CHROME / EDGE / SAFARI</span>
          {/* a full page load, not router.push: the online page's isolation headers apply only to a fresh document */}
          <a href="/melee/online" style={{ color: 'inherit', textDecoration: 'none', marginLeft: 'auto', marginRight: 12 }}>[ONLINE]</a>
          <button onClick={() => setMelee(false)} aria-label="close"
            style={{ font: 'inherit', color: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>[x]</button>
        </div>
        <iframe src={MELEE_URL} title="Melee" allow="gamepad; fullscreen; autoplay"
          allowFullScreen style={{ flex: 1, width: '100%', border: 'none' }} />
      </div>
    )}
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
