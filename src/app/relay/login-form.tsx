'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      router.push('/admin');
      return;
    }
    setBusy(false);
    setError(res.status === 429 ? 'too many attempts — wait a few minutes' : 'denied');
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[262px]">
      <div className="text-center font-mono text-[9px] tracking-[0.3em] uppercase text-white/30 mb-6">
        restricted
      </div>
      <label className="block mb-4">
        <span className="block font-mono text-[8.5px] tracking-[0.22em] uppercase text-white/30 mb-1">
          username
        </span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="w-full bg-transparent border-b border-white/15 pb-1.5 font-mono text-sm text-white outline-none focus:border-white/40"
        />
      </label>
      <label className="block mb-5">
        <span className="block font-mono text-[8.5px] tracking-[0.22em] uppercase text-white/30 mb-1">
          password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full bg-transparent border-b border-white/15 pb-1.5 font-mono text-sm text-white outline-none focus:border-white/40"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full border border-white/15 py-2.5 font-mono text-[10.5px] tracking-[0.18em] uppercase text-white hover:border-white/60 transition-colors disabled:opacity-40"
      >
        {busy ? 'enter..' : 'enter ▸'}
      </button>
      {error && (
        <div className="mt-4 text-center font-mono text-[9px] tracking-[0.16em] uppercase text-white/30">
          {error}
        </div>
      )}
    </form>
  );
}
