'use client';

import { useState } from 'react';
import { THEMES, THEME_NAMES } from '@/lib/theme';
import { Banner } from './ui';

type Props = { initialTheme: string; generation: string };
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';

export function SiteSettingsEditor({ initialTheme, generation: initialGen }: Props) {
  const [theme, setTheme] = useState(initialTheme);
  const [baseline, setBaseline] = useState(initialTheme);
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');

  const dirty = theme !== baseline;

  async function publish() {
    setStatus('publishing');
    try {
      const res = await fetch('/api/admin/site', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme, generation }),
      });
      if (res.status === 409) {
        setStatus('conflict');
        return;
      }
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const b = await res.json();
      setGeneration(b.generation);
      setBaseline(theme);
      setStatus('published');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div>
      <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-black/80 mb-1">settings — site theme</h1>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/25 mb-6">
        applies site-wide (nav, player, ticker, news log) · staged until you publish
      </p>

      {status === 'conflict' && (
        <Banner tone="warn">settings changed elsewhere — reload the page to get the latest.</Banner>
      )}
      {status === 'error' && <Banner tone="warn">publish failed — try again.</Banner>}
      {status === 'published' && <Banner tone="ok">published — live site-wide.</Banner>}

      <div className="flex flex-wrap gap-2">
        {THEME_NAMES.map((name) => {
          const active = name === theme;
          const T = THEMES[name];
          return (
            <button
              key={name}
              onClick={() => {
                setTheme(name);
                if (status !== 'idle') setStatus('idle');
              }}
              className={`font-mono text-[10px] tracking-[0.14em] uppercase px-3 py-2 border transition-colors ${
                active ? 'border-black text-black' : 'border-black/20 text-black/50 hover:border-black/50'
              }`}
            >
              <span
                className="inline-block w-2.5 h-2.5 mr-2 align-middle border border-black/20"
                style={{ background: T.bg }}
              />
              {name}
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex items-center gap-4 border-t border-black/10 pt-5">
        <button
          onClick={publish}
          disabled={!dirty || status === 'publishing'}
          className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-black border border-black/20 hover:border-black/60 px-4 py-2.5 transition-colors disabled:opacity-30 disabled:hover:border-black/20"
        >
          {status === 'publishing' ? 'publishing..' : 'publish'}
        </button>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-black/30">
          {dirty ? 'staged changes' : 'no changes'}
        </span>
      </div>
    </div>
  );
}
