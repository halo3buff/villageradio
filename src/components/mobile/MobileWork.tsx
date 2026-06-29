'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { solvePoW } from '@/lib/pow';

const SW = 402;
const SH = 874;

const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.10) 3px)';

const ARROW_ROTATIONS = [0, -90, 90, 180];

type State = 'idle' | 'solving' | 'wrong' | 'blocked' | 'error' | 'granted';

export function MobileWork() {
  const [scale, setScale]           = useState(1);
  const [inputValue, setInputValue] = useState('');
  const [focused, setFocused]       = useState(false);
  const [state, setState]           = useState<State>('idle');
  const [remaining, setRemaining]   = useState(3);
  const [blockedHours, setBlockedHours] = useState(5);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      setScale(Math.min(vw / SW, vh / SH));
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
        if (!data.bypass) {
          // Regular password — run the puzzle first (~1–2 s of CPU)
          await solvePoW('vlg-work-puzzle', 20);
        }
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

  const focusInput = () => { inputRef.current?.focus(); };

  const disabled = state === 'solving' || state === 'blocked' || state === 'granted';

  const statusText =
    state === 'solving' ? 'COMPUTING...' :
    state === 'wrong'   ? `WRONG — ${remaining} attempt${remaining !== 1 ? 's' : ''} left` :
    state === 'blocked' ? `BLOCKED — try again in ${blockedHours}h` :
    state === 'error'   ? 'ERROR — try again' :
    state === 'granted' ? 'ACCESS GRANTED' :
    '';

  const statusColor = state === 'wrong' || state === 'blocked' || state === 'error' ? '#f00' :
                      state === 'granted' ? '#000' : '#000';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', overflow: 'hidden' }}>
      <div
        className="page-enter"
        style={{
          position: 'absolute', left: '50%', top: '50%', width: SW, height: SH,
          transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center center',
        }}
      >
        {/* Arrow buttons — Figma: y=71, x=[39,130,221,312], w=h=50 */}
        <Link
          href="/"
          style={{
            position: 'absolute', left: 39, top: 71, width: 50, height: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Image
            src="/icons/left-arrow.png"
            alt="Back"
            width={50}
            height={50}
            style={{ width: 50, height: 50, objectFit: 'contain', transform: `rotate(${ARROW_ROTATIONS[0]}deg)` }}
          />
        </Link>

        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute', left: [39, 130, 221, 312][i], top: 71,
              width: 50, height: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Image
              src="/icons/left-arrow.png"
              alt=""
              aria-hidden
              width={50}
              height={50}
              style={{ width: 50, height: 50, objectFit: 'contain', transform: `rotate(${ARROW_ROTATIONS[i]}deg)` }}
            />
          </div>
        ))}

        {/* "enter password" label */}
        <div style={{
          position: 'absolute', left: 79, top: 241,
          fontFamily: BODY, fontSize: 15, color: '#000',
        }}>
          enter password
        </div>

        {/* Real input — invisible, pointer-events enabled */}
        <input
          ref={inputRef}
          type="password"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          disabled={disabled}
          autoComplete="off"
          style={{
            position: 'absolute', left: 79, top: 274, width: 243, height: 28,
            opacity: 0, zIndex: 2,
          }}
        />

        {/* Styled password box */}
        <div
          onClick={focusInput}
          style={{
            position: 'absolute', left: 79, top: 274, width: 243, height: 28,
            background: '#fff', border: '1px solid #000', boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', paddingLeft: 8, cursor: 'text',
            fontFamily: BODY, fontSize: 14, color: '#000',
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {'•'.repeat(inputValue.length)}
          {focused && !disabled && (
            <span style={{
              display: 'inline-block', width: 1, height: 14,
              background: '#000', marginLeft: inputValue.length ? 1 : 0,
              animation: 'vr-blink 1s step-end infinite',
            }} />
          )}
        </div>

        {/* Status line */}
        {statusText && (
          <div style={{
            position: 'absolute', left: 79, top: 310,
            fontFamily: MONO, fontSize: 9, lineHeight: '11px',
            color: statusColor, letterSpacing: '0.04em',
          }}>
            {statusText}
          </div>
        )}

        {/* GIF */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/MSHIQ3J3HFM7ZHHO5LXTYANRJH3SW5U3.gif"
          alt=""
          aria-hidden
          style={{
            position: 'absolute', left: 81, top: 540, width: 120, height: 240,
            objectFit: 'cover',
          }}
        />

        {/* CRT scanlines */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
          background: SCANLINES, opacity: 0.6,
        }} />
      </div>
    </div>
  );
}
