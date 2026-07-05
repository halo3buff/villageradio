'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useRef } from 'react';
import { solvePoW } from '@/lib/pow';
import { MobileStage, px } from '@/components/mobile/MobileStage';

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
                      state === 'granted' ? '#000' : '#000';

  return (
    <MobileStage zIndex={1000}>
      <div className="page-enter" style={{ position: 'absolute', inset: 0 }}>

        {/* Arrow buttons */}
        {ARROW_LEFTS.map((left, i) => (
          i === 0 ? (
            <Link
              key={i}
              href="/"
              style={{
                position: 'absolute', left: px(left), top: px(71),
                width: px(50), height: px(50),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Image
                src="/icons/left-arrow.png"
                alt="Back"
                width={50}
                height={50}
                style={{ width: px(50), height: px(50), objectFit: 'contain', transform: `rotate(${ARROW_ROTATIONS[i]}deg)` }}
              />
            </Link>
          ) : (
            <div
              key={i}
              style={{
                position: 'absolute', left: px(left), top: px(71),
                width: px(50), height: px(50),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Image
                src="/icons/left-arrow.png"
                alt=""
                aria-hidden
                width={50}
                height={50}
                style={{ width: px(50), height: px(50), objectFit: 'contain', transform: `rotate(${ARROW_ROTATIONS[i]}deg)` }}
              />
            </div>
          )
        ))}

        {/* "enter password" label */}
        <div style={{
          position: 'absolute', left: px(79), top: px(241),
          fontFamily: BODY, fontSize: px(15), color: '#000',
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
            position: 'absolute', left: px(79), top: px(274), width: px(243), height: px(28),
            opacity: 0, zIndex: 2, fontSize: 16,
          }}
        />

        {/* Styled password box */}
        <div
          onClick={focusInput}
          style={{
            position: 'absolute', left: px(79), top: px(274), width: px(243), height: px(28),
            background: '#fff', border: '1px solid #000', boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', paddingLeft: px(8), cursor: 'text',
            fontFamily: BODY, fontSize: px(14), color: '#000',
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {'•'.repeat(inputValue.length)}
          {focused && !disabled && (
            <span style={{
              display: 'inline-block', width: 1, height: px(14),
              background: '#000', marginLeft: inputValue.length ? 1 : 0,
              animation: 'vr-blink 1s step-end infinite',
            }} />
          )}
        </div>

        {/* Status line */}
        {statusText && (
          <div style={{
            position: 'absolute', left: px(79), top: px(310),
            fontFamily: MONO, fontSize: px(9), lineHeight: px(11),
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
            position: 'absolute', left: px(81), top: px(540), width: px(120), height: px(240),
            objectFit: 'cover',
          }}
        />

      </div>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
        background: SCANLINES, opacity: 0.6,
      }} />
    </MobileStage>
  );
}
