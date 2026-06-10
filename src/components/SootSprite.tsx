'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Konami code. The sprite is obscurity only — the real lock is the login behind it.
const SEQUENCE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
];
const LOGIN_PATH = '/relay';
const AUTO_HIDE_MS = 15_000;

export function SootSprite() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let pos = 0;
    function onKey(e: KeyboardEvent) {
      // Some events (autofill, password managers, IME) fire keydown with no `key` — ignore them.
      if (typeof e.key !== 'string') return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = key === SEQUENCE[pos] ? pos + 1 : key === SEQUENCE[0] ? 1 : 0;
      if (pos === SEQUENCE.length) {
        pos = 0;
        setVisible(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <button
      aria-label="enter"
      onClick={() => router.push(LOGIN_PATH)}
      className="soot-sprite fixed top-3 left-[88px] z-[60] h-7 w-7 cursor-pointer bg-transparent border-0 p-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/soot-sprite.png" alt="" className="h-full w-full object-contain" />
    </button>
  );
}
