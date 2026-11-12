'use client';

import { useState } from 'react';
import { REMARK_MAX } from '@/lib/content/log';
import { Banner } from './ui';

type Row = { n: number; tx: string; date: string };
type Props = { rows: Row[]; initialRemarks: Record<string, string>; generation: string };
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';

/** The station log's remarks: one line per broadcast day, blank = none. */
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
    <div>
      <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/80 mb-1">log — operator&apos;s remarks</h1>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/25 mb-6">
        one line per broadcast day · blank = no remark · staged until you publish
      </p>

      {status === 'conflict' && <Banner tone="warn">the log changed elsewhere — reload the page to get the latest.</Banner>}
      {status === 'error' && <Banner tone="warn">publish failed — try again.</Banner>}
      {status === 'published' && <Banner tone="ok">published — live on the log.</Banner>}

      <div className="flex flex-col gap-2 max-w-2xl">
        {rows.map((r, i) => (
          <label key={r.n} className="flex items-center gap-4 font-mono text-[10px] tracking-[0.12em] uppercase text-white/50">
            <span className="shrink-0 tabular-nums">TX {r.tx}</span>
            <span className="shrink-0 tabular-nums text-white/30">{r.date}{i === 0 ? ' · today' : ''}</span>
            <input
              value={remarks[r.n] ?? ''}
              maxLength={REMARK_MAX}
              placeholder="no remarks"
              onChange={(e) => {
                const next = { ...remarks };
                if (e.target.value) next[r.n] = e.target.value;
                else delete next[r.n];
                setRemarks(next);
                if (status !== 'idle') setStatus('idle');
              }}
              className="flex-1 min-w-0 bg-transparent border-b border-white/15 focus:border-white/60 outline-none py-1 normal-case tracking-normal text-[12px] text-white placeholder:text-white/20"
            />
          </label>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-4 border-t border-white/10 pt-5">
        <button
          onClick={publish}
          disabled={!dirty || status === 'publishing'}
          className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-white border border-white/20 hover:border-white/60 px-4 py-2.5 transition-colors disabled:opacity-30 disabled:hover:border-white/20"
        >
          {status === 'publishing' ? 'publishing..' : 'publish'}
        </button>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-white/30">{dirty ? 'staged changes' : 'no changes'}</span>
      </div>
    </div>
  );
}
