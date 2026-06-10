'use client';

import { useEffect, useState } from 'react';
import { advance } from '@/lib/auth/key-sequence';
import { LoginForm } from '@/components/LoginForm';

// The hidden admin entry. Mounted ONLY on the homepage (src/app/page.tsx), so the sequence works
// nowhere else. The sprite is obscurity only — the real lock is the login + the 404-gated /admin.
const SEQUENCE = ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowDown'];
const AUTO_HIDE_MS = 15_000;

export function SootSprite() {
  const [spriteVisible, setSpriteVisible] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  // Listen for the secret sequence.
  useEffect(() => {
    let pos = 0;
    function onKey(e: KeyboardEvent) {
      // Some events (autofill, password managers, IME) fire keydown with no `key` — ignore them.
      if (typeof e.key !== 'string') return;
      pos = advance(pos, e.key, SEQUENCE);
      if (pos === SEQUENCE.length) {
        pos = 0;
        setSpriteVisible(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auto-hide the sprite after a while — but not once the login overlay is open.
  useEffect(() => {
    if (!spriteVisible || loginOpen) return;
    const t = setTimeout(() => setSpriteVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [spriteVisible, loginOpen]);

  // Escape closes the login overlay.
  useEffect(() => {
    if (!loginOpen) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setLoginOpen(false);
    }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [loginOpen]);

  return (
    <>
      {spriteVisible && !loginOpen && (
        <button
          aria-label="enter"
          onClick={() => setLoginOpen(true)}
          className="soot-sprite fixed top-3 left-[88px] z-[60] h-7 w-7 cursor-pointer bg-transparent border-0 p-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/soot-sprite.png" alt="" className="h-full w-full object-contain" />
        </button>
      )}

      {loginOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#080808]/95 px-5 page-enter"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLoginOpen(false);
          }}
        >
          <LoginForm />
        </div>
      )}
    </>
  );
}
