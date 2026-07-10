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

const MONO   = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const BODY   = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const SEGOE  = "'Segoe UI', system-ui, 'Helvetica Neue', Arial, sans-serif";
const RED    = '#ff0000';

// Scope position in the right 1440×1024 frame — mirrored from original left-side coords.
// Original was left:274 → right-mirrored: left = 1440-274-600 = 566
const SCOPE_L = 566;
const SCOPE_T = 200;
const SCOPE_W = 600;
const SCOPE_H = 660;

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
          {/* HeaderCluster — shifted left via xOffset so it anchors top-left.
              Cluster coords span x:1052–1440; offset -1017 moves leftmost element to x:35. */}
          <HeaderCluster xOffset={-1017} />

          {/* Command prompt — MONO style, understated */}
          <div
            style={{
              position: 'absolute', left: 20, top: 890,
              pointerEvents: 'auto', cursor: 'text',
              fontFamily: MONO, fontSize: 16, lineHeight: 1,
              letterSpacing: '0.04em', color: '#000',
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
                  background: '#000', verticalAlign: '-0.1em',
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
              color: '#000', textDecoration: 'none', pointerEvents: 'auto',
            }}
          >
            README
          </Link>

          {/* Chromeless vectorscope — right side */}
          <div style={{ position: 'absolute', left: SCOPE_L, top: SCOPE_T, width: SCOPE_W, height: SCOPE_H, pointerEvents: 'auto' }}>
            <MobileScope />
          </div>

          {/* Telemetry overlays */}
          <ScopeTelemetry sl={SCOPE_L} st={SCOPE_T} sw={SCOPE_W} sh={SCOPE_H} />

          {/* Broadcast status */}
          <div style={{
            position: 'absolute', left: SCOPE_L + 8, top: SCOPE_T + 8,
            fontFamily: BODY, fontSize: 11, lineHeight: '11px', textTransform: 'uppercase',
            color: '#000', zIndex: 3, pointerEvents: 'none',
          }}>
            {'> BROADCAST '}
            <BroadcastLiveTag />
          </div>
        </>
      }
    />
  );
}
