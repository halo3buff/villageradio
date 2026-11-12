'use client';

import { useState } from 'react';
import { REMARK_MAX } from '@/lib/content/log';

type Row = { n: number; tx: string; date: string };
type Props = { rows: Row[]; initialRemarks: Record<string, string>; generation: string };
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';

const NOTE: Record<Status, string> = { idle: '', publishing: '', published: 'Live on /log', conflict: 'Changed elsewhere — reload', error: 'Failed — try again' };

/** The station log's remarks, a small panel under the broadcast library: one line per day, blank = none. */
export function LogEditor({ rows, initialRemarks, generation: initialGen }: Props) {
  const [remarks, setRemarks] = useState(initialRemarks);
  const [baseline, setBaseline] = useState(JSON.stringify(initialRemarks));
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');
  const dirty = JSON.stringify(remarks) !== baseline;

  async function publish() {
    setStatus('publishing');
    try {
      const res = await fetch('/api/admin/log', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ remarks, generation }),
      });
      if (res.status === 409) return setStatus('conflict');
      if (!res.ok) return setStatus('error');
      setGeneration((await res.json()).generation);
      setBaseline(JSON.stringify(remarks));
      setStatus('published');
    } catch {
      setStatus('error');
    }
  }

  return (
    <section className="shrink-0 rounded-lg border border-white/10 p-3 bg-[rgb(30_30_30/0.2)] backdrop-blur-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="font-sans text-[13px] font-medium text-white/90">Log</span>
        <button
          onClick={publish}
          disabled={!dirty || status === 'publishing'}
          className="h-7 rounded-md border border-white/12 px-2.5 font-sans text-[12px] text-white/80 hover:bg-white/[0.06] hover:text-white active:scale-[0.97] transition-[transform,background-color,color] duration-150 disabled:opacity-30 disabled:pointer-events-none"
        >
          {status === 'publishing' ? 'Publishing…' : 'Publish'}
        </button>
      </div>
      {rows.map((r, i) => (
        <label key={r.n} className="block py-1">
          <span className="font-mono text-[9.5px] tracking-[0.08em] text-white/35 tabular-nums">
            TX {r.tx} · {i === 0 ? 'today' : r.date}
          </span>
          <input
            value={remarks[r.n] ?? ''}
            maxLength={REMARK_MAX}
            placeholder="No remarks"
            onChange={(e) => {
              const next = { ...remarks };
              if (e.target.value) next[r.n] = e.target.value;
              else delete next[r.n];
              setRemarks(next);
              if (status !== 'idle') setStatus('idle');
            }}
            className="block w-full bg-transparent border-b border-white/12 focus:border-white/50 outline-none py-1 font-sans text-[12px] text-white/90 placeholder:text-white/20"
          />
        </label>
      ))}
      {NOTE[status] && <p className="mt-2 font-sans text-[11px] text-white/45">{NOTE[status]}</p>}
    </section>
  );
}
