'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { grantClearance } from '@/lib/clearance';
import { C64Logo } from '@/components/C64Logo';
import { HtopBroadcast } from '@/components/HtopBroadcast';

// Authentic IBM VGA 8x16 DOS text-mode face.
const FONT = "var(--font-ibm-vga), 'Courier New', monospace";

// Sampled straight from the reference image.
const BG64 = '#01289d';   // C64 royal-blue screen
const FG64 = '#a5def8';   // C64 light-blue ink
const WHITE = '#FFFFFF';
const CYAN  = '#00AAAA';
const GREEN = '#55FF55';
const LTRED = '#FF5555';
const YELLOW = '#FFFF55';
const GRAY = '#a8a8a8';   // TempleOS light-gray dialog fill (from the reference)
const PURPLE = '#aa22aa'; // TempleOS purple heading (from the reference)
const BORDER_BLUE = '#000070'; // dark royal-blue frame lines (from the reference)

// The BASIC listing shown on the boot screen.
const LISTING =
  '10 PRINT CHR$(147):REM CLEAR SCREEN\n' +
  '20 FOR I=0 TO 15:POKE 53280,I:REM SCREEN BORDER COLOR DEMO\n' +
  '30 POKE 53281,0:REM BACKGROUND BLACK\n' +
  '40 GOSUB 1000:REM DISPLAY LOGO\n' +
  '50 END';

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

/**
 * Desktop homepage — a TempleOS-style split screen. The left half is a live
 * Village-64 (Commodore-flavoured) boot screen: code-drawn logo, real text,
 * blinking cursor. The interactive command prompt is pinned at the bottom; the
 * right half is an empty white pane.
 */
export function HomeDesktop() {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cmd,  setCmd]  = useState('');
  const [echo, setEcho] = useState<Echo | null>(null);
  const [err,  setErr]  = useState<string | null>(null);
  // Live UTC clock — placeholder matches SSR, real time set after mount.
  const [clock, setClock] = useState('Sun 06/07 14:36:36');

  useEffect(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const p = (n: number) => String(n).padStart(2, '0');
    const tick = () => {
      const d = new Date();
      setClock(
        `${days[d.getUTCDay()]} ${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ` +
        `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (echo) return;
    if (e.key !== 'Enter') return;
    const raw  = cmd.trim();
    if (!raw) return;
    const norm = raw.replace(/[‘’]/g, "'");
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
    <div
      style={{
        position: 'absolute', inset: 0, background: '#000',
        color: WHITE, fontFamily: FONT, fontSize: 16, lineHeight: '16px',
        letterSpacing: '0.02em', overflow: 'hidden', userSelect: 'none',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* ── Top task/menu bar (full width) ─────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, whiteSpace: 'nowrap',
        overflow: 'hidden', padding: '3px 6px', flexShrink: 0,
      }}>
        <span style={{ color: WHITE }}>♦ MENU</span>
        <span style={{ color: '#AAAAAA' }}>{clock} UTC FPS:31 Mem:001604CC00 CPU 6</span>
        <span style={{ marginLeft: 'auto', color: WHITE }}>PRTSCRN</span>
      </div>

      {/* ── Split: two windows, double-line divider just left of center ─────── */}
      <div style={{
        flex: 1, minHeight: 0, display: 'flex',
        border: `2px solid ${WHITE}`,
      }}>
        {/* LEFT — live Village-64 boot screen */}
        <div style={{
          flex: '0 0 50%', minWidth: 0, display: 'flex', flexDirection: 'column',
          padding: '18px 16px 12px', overflow: 'hidden',
          background: BG64, color: FG64, lineHeight: '17px',
          borderRight: `4px double ${WHITE}`,
        }}>
          <div style={{ textAlign: 'center' }}>{'**** VILLAGE 64 BASIC V2 ****'}</div>
          <div style={{ textAlign: 'center' }}>{'64K RAM SYSTEM  38911 BASIC BYTES FREE'}</div>

          <C64Logo
            color={FG64}
            style={{ width: '56%', height: 'auto', alignSelf: 'center', margin: '22px 0 20px' }}
          />

          <div style={{ whiteSpace: 'pre' }}>{LISTING}</div>
          <div style={{ height: 14 }} />
          <div>READY.</div>

          {/* Live command prompt — pinned at the bottom */}
          <div
            onClick={() => inputRef.current?.focus()}
            style={{ cursor: 'text', marginTop: 'auto', whiteSpace: 'nowrap' }}
          >
            <span style={{ color: GREEN }}>{'C:/Home>'}</span>
            {echo ? (
              <span style={{ color: LTRED }}>{echo.cmd}{'  ->  '}{echo.path}</span>
            ) : err ? (
              <span style={{ color: LTRED }}>{err}</span>
            ) : (
              <>
                <span>{cmd}</span>
                <span style={{
                  display: 'inline-block', width: '0.6em', height: '1em',
                  background: YELLOW, verticalAlign: '-0.15em',
                  marginLeft: 1, animation: 'vr-blink 1s step-end infinite',
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

          <div style={{ color: CYAN, marginTop: 4 }}>TX</div>
        </div>

        {/* RIGHT — white pane; the live broadcast is a discrete TempleOS gray
            dialog occupying only the upper-right, like the reference. */}
        <div style={{
          flex: 1, minWidth: 0, background: WHITE, overflow: 'hidden',
          padding: 16, display: 'flex',
          justifyContent: 'flex-end', alignItems: 'flex-start',
        }}>
          {/* Gray square — no outer border; a blue double-line frame sits inside */}
          <div style={{ display: 'inline-block', background: GRAY, padding: 6, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex', flexDirection: 'column',
                border: `3px double ${BORDER_BLUE}`, padding: '8px 12px 12px',
                // Re-skin the broadcast: VGA face, royal-blue ink on gray.
                '--font-ibm-plex-mono': 'var(--font-ibm-vga)',
                '--vlg-fg': '#2a2ac0',
                '--vlg-strong': '#141488',
              } as React.CSSProperties}
            >
              <div style={{ textAlign: 'center', color: PURPLE, marginBottom: 8 }}>
                Live Broadcast Monitor
              </div>
              <HtopBroadcast />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
