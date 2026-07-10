'use client';

import { useState, useMemo } from 'react';
import type { NavCommand } from '@/lib/types';
import { Banner, RowBtn, FIELD, FIELD_LABEL } from './ui';

type Props = { initialCommands: NavCommand[]; generation: string };
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';

export function CommandsEditor({ initialCommands, generation: initialGen }: Props) {
  const [commands, setCommands] = useState<NavCommand[]>(initialCommands);
  const [baseline, setBaseline] = useState<NavCommand[]>(initialCommands);
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const dirty = useMemo(() => JSON.stringify(commands) !== JSON.stringify(baseline), [commands, baseline]);

  function patch(i: number, fields: Partial<NavCommand>) {
    const next = commands.map((c, idx) => idx === i ? { ...c, ...fields } : c);
    setCommands(next);
    if (status !== 'idle') setStatus('idle');
  }

  function remove(i: number) {
    setCommands(commands.filter((_, idx) => idx !== i));
    if (status !== 'idle') setStatus('idle');
  }

  function add() {
    setCommands([...commands, { cmd: '', route: '/', label: '' }]);
    if (status !== 'idle') setStatus('idle');
  }

  async function publish() {
    setError('');
    setStatus('publishing');
    try {
      const res = await fetch('/api/admin/commands', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manifest: { version: 1, commands }, generation }),
      });
      if (res.status === 409) { setStatus('conflict'); return; }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? 'publish failed');
        setStatus('error');
        return;
      }
      const b = await res.json();
      setGeneration(b.generation);
      setBaseline(commands);
      setStatus('published');
    } catch {
      setError('network error — try again');
      setStatus('error');
    }
  }

  return (
    <div>
      <div className="flex items-baseline gap-4 mb-1">
        <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-black/80">
          information — navigation commands
        </h1>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-black/25">
          {commands.length} commands
        </span>
      </div>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/25 mb-6">
        these are the commands shown on the readme page and used by the mobile prompt · publish to update both
      </p>

      {status === 'conflict' && (
        <Banner tone="warn">commands changed elsewhere — reload and retry.</Banner>
      )}
      {status === 'error' && error && <Banner tone="warn">{error}</Banner>}
      {status === 'published' && <Banner tone="ok">published — readme and nav are live.</Banner>}

      {/* Preview of how it appears on the README */}
      <div className="mb-6 border border-black/10 p-3">
        <span className={FIELD_LABEL}>readme preview</span>
        <pre className="font-mono text-[10px] text-black/70 leading-relaxed mt-1">{
          'commands:\n' + commands.map(c => `  ${c.cmd.padEnd(12)} ${c.label}`).join('\n')
        }</pre>
      </div>

      {/* Command rows */}
      <div className="border-t border-black/10">
        {commands.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end border-b border-black/10 py-3">
            <label>
              <span className={FIELD_LABEL}>command</span>
              <input className={FIELD} value={c.cmd} onChange={e => patch(i, { cmd: e.target.value })} spellCheck={false} />
            </label>
            <label>
              <span className={FIELD_LABEL}>route</span>
              <input className={FIELD} value={c.route} onChange={e => patch(i, { route: e.target.value })} spellCheck={false} />
            </label>
            <label>
              <span className={FIELD_LABEL}>label</span>
              <input className={FIELD} value={c.label} onChange={e => patch(i, { label: e.target.value })} />
            </label>
            <div className="pb-1">
              <RowBtn onClick={() => remove(i)} label="remove" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <button
          onClick={add}
          className="font-mono text-[10px] tracking-[0.16em] uppercase text-black/45 hover:text-black border border-black/15 hover:border-black/40 px-3 py-2 transition-colors"
        >
          + add command
        </button>
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
