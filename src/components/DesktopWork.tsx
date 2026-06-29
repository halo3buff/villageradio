'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { solvePoW } from '@/lib/pow';

// Stage matches Figma desktop frame exactly
const SW = 1440;
const SH = 1024;

const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

// Figma: arrows at y=37, x=[42,146,237,328] each ~50×50
// Using left-arrow.png rotated: 180°=→, 90°=↓, 90°=↓, -90°=↑
const ARROWS = [
  { left: 42,  top: 37, rot: 180, href: '/' },   // → links home
  { left: 146, top: 37, rot: 90,  href: null },
  { left: 237, top: 37, rot: 90,  href: null },
  { left: 328, top: 37, rot: -90, href: null },
];

type State = 'idle' | 'solving' | 'wrong' | 'blocked' | 'error' | 'granted';

export function DesktopWork() {
  const [scale, setScale]         = useState(1);
  const [inputValue, setInputValue] = useState('');
  const [focused, setFocused]     = useState(false);
  const [state, setState]         = useState<State>('idle');
  const [remaining, setRemaining] = useState(3);
  const [blockedHours, setBlockedHours] = useState(5);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      setScale(Math.min(1, vw / SW, vh / SH));
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  const submit = async () => {
    if (!inputValue || state === 'solving' || state === 'blocked' || state === 'granted') return;
    setState('solving');
    try {
      const res = await fetch('/api/work/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: inputValue }),
      });
      const data = await res.json() as { ok?: boolean; bypass?: boolean; error?: string; remaining?: number; hours?: number };
      if (res.ok && data.ok) {
        if (!data.bypass) await solvePoW('vlg-work-puzzle', 20);
        sessionStorage.setItem('work_unlocked', '1');
        setState('granted');
      } else if (res.status === 429) {
        setBlockedHours(data.hours ?? 5);
        setState('blocked');
      } else if (res.status === 401) {
        setRemaining(data.remaining ?? 0);
        setState('wrong');
        setInputValue('');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  const disabled = state === 'solving' || state === 'blocked' || state === 'granted';

  const statusText =
    state === 'solving' ? 'COMPUTING...' :
    state === 'wrong'   ? `WRONG — ${remaining} attempt${remaining !== 1 ? 's' : ''} left` :
    state === 'blocked' ? `BLOCKED — try again in ${blockedHours}h` :
    state === 'error'   ? 'ERROR — try again' :
    state === 'granted' ? 'ACCESS GRANTED' : '';

  const statusColor = (state === 'wrong' || state === 'blocked' || state === 'error') ? '#f00' : '#000';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', overflow: 'hidden' }}>
      <div
        className="page-enter"
        style={{
          position: 'absolute', left: '50%', top: '50%', width: SW, height: SH,
          transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center center',
        }}
      >
        {/* Directional arrows — top-left */}
        {ARROWS.map((a, i) =>
          a.href ? (
            <Link key={i} href={a.href} style={{
              position: 'absolute', left: a.left, top: a.top,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 50, height: 50, pointerEvents: 'auto',
            }}>
              <Image src="/icons/left-arrow.png" alt="" aria-hidden width={50} height={50}
                style={{ width: 50, height: 50, objectFit: 'contain', transform: `rotate(${a.rot}deg)` }} />
            </Link>
          ) : (
            <div key={i} style={{
              position: 'absolute', left: a.left, top: a.top,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 50, height: 50,
            }}>
              <Image src="/icons/left-arrow.png" alt="" aria-hidden width={50} height={50}
                style={{ width: 50, height: 50, objectFit: 'contain', transform: `rotate(${a.rot}deg)` }} />
            </div>
          )
        )}

        {/* "enter password" label — Figma: x=599, y=440 */}
        <div style={{
          position: 'absolute', left: 599, top: 440,
          fontFamily: BODY, fontSize: 15, color: '#000',
        }}>
          enter password
        </div>

        {/* Hidden real input */}
        <input
          ref={inputRef}
          type="password"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          disabled={disabled}
          autoComplete="off"
          style={{
            position: 'absolute', left: 599, top: 457, width: 243, height: 28,
            opacity: 0, zIndex: 2, pointerEvents: 'auto',
          }}
        />

        {/* Styled password box — Figma: x=599, y=457, w=243, h=28 */}
        <div
          onClick={() => inputRef.current?.focus()}
          style={{
            position: 'absolute', left: 599, top: 457, width: 243, height: 28,
            background: '#fff', border: '1px solid #000', boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', paddingLeft: 8, cursor: 'text',
            fontFamily: BODY, fontSize: 14, color: '#000',
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {'•'.repeat(inputValue.length)}
          {focused && !disabled && (
            <span style={{
              display: 'inline-block', width: 1, height: 14, background: '#000',
              marginLeft: inputValue.length ? 1 : 0,
              animation: 'vr-blink 1s step-end infinite',
            }} />
          )}
        </div>

        {/* Status line */}
        {statusText && (
          <div style={{
            position: 'absolute', left: 599, top: 492,
            fontFamily: MONO, fontSize: 9, lineHeight: '11px',
            color: statusColor, letterSpacing: '0.04em',
          }}>
            {statusText}
          </div>
        )}

        {/* Li-Beirut poster — Figma: x=1074, y=650, w=120, h=240 */}
        <div style={{
          position: 'absolute', left: 1074, top: 650, width: 120, height: 240, overflow: 'hidden',
        }}>
          <Image
            src="/images/li_beirut_poster.jpg"
            alt=""
            fill
            style={{ objectFit: 'cover' }}
            sizes="120px"
          />
        </div>
      </div>
    </div>
  );
}
