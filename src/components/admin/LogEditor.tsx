'use client';

import { useState } from 'react';
import { BROADCAST_TZ } from '@/lib/content/broadcast';
import { ENTRY_MAX, type LogEntry } from '@/lib/content/log';

type Props = { initial: LogEntry[]; generation: string };
type Status = 'idle' | 'saving' | 'conflict' | 'error';

const SHOWN = 8;
const when = new Intl.DateTimeFormat('en-US', { timeZone: BROADCAST_TZ, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** The station log, from the console: post a line and it goes out on the station's feed at once. */
export function LogEditor({ initial, generation: initialGen }: Props) {
  const [entries, setEntries] = useState(initial);
  const [generation, setGeneration] = useState(initialGen);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  async function save(next: LogEntry[]) {
    setStatus('saving');
    try {
      const res = await fetch('/api/admin/log', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entries: next, generation }),
      });
      if (res.status === 409) return setStatus('conflict');
      if (!res.ok) return setStatus('error');
      setGeneration((await res.json()).generation);
      setEntries(next);
      setStatus('idle');
      return true;
    } catch {
      setStatus('error');
    }
  }

  async function post() {
    if (!draft.trim()) return;
    if (await save([...entries, { at: Date.now(), text: draft.trim() }])) setDraft('');
  }

  return (
    <section className="shrink-0 rounded-lg border border-white/10 p-3 bg-[rgb(30_30_30/0.2)] backdrop-blur-lg">
      <span className="block mb-2 font-sans text-[13px] font-medium text-white/90">Log</span>
      <div className="space-y-1 mb-2">
        {entries.slice(-SHOWN).map((e) => (
          <div key={e.at} className="group flex items-baseline gap-2">
            <span className="shrink-0 font-mono text-[9.5px] text-white/35 tabular-nums">{when.format(e.at).replace(',', '')}</span>
            <span className="min-w-0 flex-1 font-sans text-[12px] text-white/85 break-words">{e.text}</span>
            <button
              onClick={() => save(entries.filter((x) => x !== e))}
              disabled={status === 'saving'}
              aria-label="Delete entry"
              className="shrink-0 font-mono text-[11px] text-white/25 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        ))}
        {entries.length === 0 && <p className="font-sans text-[11.5px] text-white/25">Nothing logged yet.</p>}
      </div>
      <form onSubmit={(ev) => { ev.preventDefault(); post(); }} className="flex items-center gap-2">
        <input
          value={draft}
          maxLength={ENTRY_MAX}
          placeholder="Log a line…"
          onChange={(e) => { setDraft(e.target.value); if (status !== 'saving') setStatus('idle'); }}
          className="min-w-0 flex-1 bg-transparent border-b border-white/12 focus:border-white/50 outline-none py-1 font-sans text-[12px] text-white/90 placeholder:text-white/20"
        />
        <button
          disabled={!draft.trim() || status === 'saving'}
          className="h-7 shrink-0 rounded-md border border-white/12 px-2.5 font-sans text-[12px] text-white/80 hover:bg-white/[0.06] hover:text-white active:scale-[0.97] transition-[transform,background-color,color] duration-150 disabled:opacity-30 disabled:pointer-events-none"
        >
          {status === 'saving' ? 'Posting…' : 'Post'}
        </button>
      </form>
      {status === 'conflict' && <p className="mt-2 font-sans text-[11px] text-white/45">Changed elsewhere — reload</p>}
      {status === 'error' && <p className="mt-2 font-sans text-[11px] text-white/45">Failed — try again</p>}
    </section>
  );
}
