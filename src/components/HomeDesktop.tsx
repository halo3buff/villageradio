'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BroadcastLiveTag } from '@/components/BroadcastLiveTag';
import { FitStage } from '@/components/FitStage';
import { HeaderCluster } from '@/components/HeaderCluster';
import { MobileScope } from '@/components/mobile/MobileScope';
import { ScopeTelemetry } from '@/components/ScopeTelemetry';
import { grantClearance } from '@/lib/clearance';

const DISPLAY = 'var(--font-hn-black), "Helvetica Neue", Arial, sans-serif';
const BODY    = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const SEGOE   = "'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif";
const RED     = '#ff0000';

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

/** Desktop homepage — command prompt navigation, same commands as mobile. */
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
          {/* README — top-left, links to /information */}
          <Link
            href="/information"
            style={{
              position: 'absolute', left: 35, top: 35,
              fontFamily: SEGOE, fontSize: 11, lineHeight: '11px',
              color: '#000', textDecoration: 'none', pointerEvents: 'auto',
            }}
          >
            README
          </Link>

          {/* Chromeless vectorscope */}
          <div style={{ position: 'absolute', left: 274, top: 200, width: 600, height: 660, pointerEvents: 'auto' }}>
            <MobileScope />
          </div>

          {/* Telemetry overlays */}
          <ScopeTelemetry />

          {/* Broadcast status */}
          <div style={{
            position: 'absolute', left: 282, top: 208,
            fontFamily: BODY, fontSize: 11, lineHeight: '11px', textTransform: 'uppercase',
            color: '#000', zIndex: 3, pointerEvents: 'none',
          }}>
            {'> BROADCAST '}
            <BroadcastLiveTag />
          </div>

          {/* Command prompt — same firewall as mobile, keyboard-driven on desktop */}
          <div
            style={{
              position: 'absolute', left: 20, top: 890,
              pointerEvents: 'auto', cursor: 'text',
              fontFamily: DISPLAY, fontSize: 36, lineHeight: 1,
              letterSpacing: '-0.13em', color: '#000',
              whiteSpace: 'nowrap', userSelect: 'none',
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {echo ? (
              <span style={{ color: RED }}>
                {'> '}{echo.cmd}{'  ->  '}{echo.path}
              </span>
            ) : err ? (
              <span style={{ fontFamily: BODY, fontSize: 13, letterSpacing: '0.05em' }}>
                {err}
              </span>
            ) : (
              <>
                {'> '}
                <span>{cmd}</span>
                <span style={{
                  display: 'inline-block',
                  width: '0.35em', height: '0.8em',
                  background: '#000', verticalAlign: '-0.08em',
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
          {/* VILLAGE RADIO logo cluster — top right */}
          <HeaderCluster />
        </>
      }
    />
  );
}
