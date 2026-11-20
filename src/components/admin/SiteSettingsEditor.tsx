'use client';

import { useState } from 'react';
import { THEMES, THEME_NAMES } from '@/lib/theme';
import { clockTime } from '@/lib/content/broadcast';
import type { NewsHour } from '@/lib/types';
import { Banner } from './ui';

type Props = { initialTheme: string; initialNews: NewsHour; generation: string };
const FIELD = 'font-mono text-[10px] tracking-[0.1em] bg-transparent border border-white/20 px-2 py-1.5 text-white outline-none focus:border-white/60';
const LABEL = 'font-mono text-[9px] tracking-[0.16em] uppercase text-white/40';
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';

export function SiteSettingsEditor({ initialTheme, initialNews, generation: initialGen }: Props) {
  const [theme, setTheme] = useState(initialTheme);
  const [news, setNews] = useState(initialNews);
  const [baseline, setBaseline] = useState({ theme: initialTheme, news: initialNews });
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');

  const dirty = theme !== baseline.theme || JSON.stringify(news) !== JSON.stringify(baseline.news);
  const edit = (patch: Partial<NewsHour>) => { setNews((n) => ({ ...n, ...patch })); if (status !== 'idle') setStatus('idle'); };

  async function publish() {
    setStatus('publishing');
    try {
      const res = await fetch('/api/admin/site', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme, news, generation }),
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
      setBaseline({ theme, news });
      setStatus('published');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div>
      <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/80 mb-1">settings — site theme</h1>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/25 mb-6">
        applies site-wide, every page · staged until you publish
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
                active ? 'border-white text-white' : 'border-white/20 text-white/50 hover:border-white/50'
              }`}
            >
              <span
                className="inline-block w-2.5 h-2.5 mr-2 align-middle border border-white/20"
                style={{ background: T.bg }}
              />
              {name}
            </button>
          );
        })}
      </div>

      <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/80 mt-10 mb-1">news hour</h2>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/25 mb-4">
        a live stream airs in place of the schedule, daily · times are eastern · the station shows the note
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={news.on} onChange={(e) => edit({ on: e.target.checked })} />
          <span className={LABEL}>on air daily</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>starts</span>
          <input type="time" className={FIELD} value={clockTime(news.start)}
            onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); if (!isNaN(h) && !isNaN(m)) edit({ start: h * 3600 + m * 60 }); }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>minutes</span>
          <input type="number" min={1} max={240} className={`${FIELD} w-20`} value={news.minutes}
            onChange={(e) => edit({ minutes: Math.max(1, Math.min(240, Math.round(Number(e.target.value) || 1))) })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>name on the station</span>
          <input type="text" maxLength={60} className={`${FIELD} w-64`} value={news.name} onChange={(e) => edit({ name: e.target.value.toUpperCase() })} />
        </label>
        <label className="flex flex-col gap-1 w-full max-w-xl">
          <span className={LABEL}>stream url (https, mp3/aac)</span>
          <input type="url" className={FIELD} value={news.url} onChange={(e) => edit({ url: e.target.value.trim() })} />
        </label>
      </div>

      <div className="mt-8 flex items-center gap-4 border-t border-white/10 pt-5">
        <button
          onClick={publish}
          disabled={!dirty || status === 'publishing'}
          className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-white border border-white/20 hover:border-white/60 px-4 py-2.5 transition-colors disabled:opacity-30 disabled:hover:border-white/20"
        >
          {status === 'publishing' ? 'publishing..' : 'publish'}
        </button>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-white/30">
          {dirty ? 'staged changes' : 'no changes'}
        </span>
      </div>
    </div>
  );
}
