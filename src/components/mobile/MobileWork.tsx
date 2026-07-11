'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useRef } from 'react';
import { solvePoW } from '@/lib/pow';

const SW = 402;
const SH = 874;
const vw = (n: number) => `${(n / SW * 100).toFixed(2)}vw`;
const dvh = (n: number) => `${(n / SH * 100).toFixed(2)}dvh`;

const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.10) 3px)';

const ARROW_ROTATIONS = [0, -90, 90, 180];
const ARROW_LEFTS = [39, 130, 221, 312];

type State = 'idle' | 'solving' | 'wrong' | 'blocked' | 'error' | 'granted';

export function MobileWork() {
  const [inputValue, setInputValue] = useState('');
  const [focused, setFocused]       = useState(false);
  const [state, setState]           = useState<State>('idle');
  const [remaining, setRemaining]   = useState(3);
  const [blockedHours, setBlockedHours] = useState(5);
  const inputRef = useRef<HTMLInputElement>(null);

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
                      state === 'granted' ? 'var(--vlg-fg, #000)' : 'var(--vlg-fg, #000)';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--vlg-bg, #fff)', overflow: 'hidden' }}>
      <div className="page-enter" style={{ position: 'absolute', inset: 0 }}>

        {/* Arrow buttons */}
        {ARROW_LEFTS.map((left, i) => (
          i === 0 ? (
            <Link
              key={i}
              href="/"
              style={{
                position: 'absolute', left: vw(left), top: dvh(71),
                width: vw(50), height: vw(50),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Image
                src="/icons/left-arrow.png"
                alt="Back"
                width={50}
                height={50}
                style={{ width: vw(50), height: vw(50), objectFit: 'contain', transform: `rotate(${ARROW_ROTATIONS[i]}deg)` }}
              />
            </Link>
          ) : (
            <div
              key={i}
              style={{
                position: 'absolute', left: vw(left), top: dvh(71),
                width: vw(50), height: vw(50),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Image
                src="/icons/left-arrow.png"
                alt=""
                aria-hidden
                width={50}
                height={50}
                style={{ width: vw(50), height: vw(50), objectFit: 'contain', transform: `rotate(${ARROW_ROTATIONS[i]}deg)` }}
              />
            </div>
          )
        ))}

        {/* "enter password" label */}
        <div style={{
          position: 'absolute', left: vw(79), top: dvh(241),
          fontFamily: BODY, fontSize: vw(15), color: 'var(--vlg-fg, #000)',
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
            position: 'absolute', left: vw(79), top: dvh(274), width: vw(243), height: dvh(28),
            opacity: 0, zIndex: 2, fontSize: 16,
          }}
        />

        {/* Styled password box */}
        <div
          onClick={focusInput}
          style={{
            position: 'absolute', left: vw(79), top: dvh(274), width: vw(243), height: dvh(28),
            background: 'var(--vlg-bg, #fff)', border: '1px solid #000', boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', paddingLeft: vw(8), cursor: 'text',
            fontFamily: BODY, fontSize: vw(14), color: 'var(--vlg-fg, #000)',
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {'•'.repeat(inputValue.length)}
          {focused && !disabled && (
            <span style={{
              display: 'inline-block', width: 1, height: vw(14),
              background: 'var(--vlg-fg, #000)', marginLeft: inputValue.length ? 1 : 0,
              animation: 'vr-blink 1s step-end infinite',
            }} />
          )}
        </div>

        {/* Status line */}
        {statusText && (
          <div style={{
            position: 'absolute', left: vw(79), top: dvh(310),
            fontFamily: MONO, fontSize: vw(9), lineHeight: dvh(11),
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
            position: 'absolute', left: vw(81), top: dvh(540), width: vw(120), height: dvh(240),
            objectFit: 'cover',
          }}
        />

      </div>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
        background: SCANLINES, opacity: 0.6,
      }} />
    </div>
  );
}
