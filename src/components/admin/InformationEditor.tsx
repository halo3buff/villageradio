'use client';

import { useState, useEffect, useMemo } from 'react';
import { EditorialBody } from '@/components/EditorialBody';
import { Banner, FIELD_LABEL, FIELD_AREA } from './ui';

type Props = { initialText: string; generation: string };
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';

export function InformationEditor({ initialText, generation: initialGen }: Props) {
  const [text, setText] = useState(initialText);
  const [baseline, setBaseline] = useState(initialText);
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<string[]>([]);

  const dirty = useMemo(() => text !== baseline, [text, baseline]);

  // Warn before navigating away with unpublished edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function onChange(next: string) {
    setText(next);
    if (status !== 'idle') setStatus('idle');
  }

  async function publish() {
    setErrors([]);
    setStatus('publishing');
    try {
      const res = await fetch('/api/admin/information', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, generation }),
      });
      if (res.status === 409) {
        setStatus('conflict');
        return;
      }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErrors([b.error ?? 'publish failed']);
        setStatus('error');
        return;
      }
      const b = await res.json();
      setGeneration(b.generation);
      setBaseline(text);
      setStatus('published');
    } catch {
      setErrors(['network error — try again']);
      setStatus('error');
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-baseline gap-4 mb-1">
        <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/80">information — document</h1>
      </div>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/25 mb-6">
        markdown · blank line between blocks · # heading · --- divider · staged until you publish
      </p>

      {/* Banners */}
      {status === 'conflict' && (
        <Banner tone="warn">
          information changed elsewhere — reload the page to get the latest, then redo your edits.
        </Banner>
      )}
      {status === 'error' && errors.length > 0 && (
        <Banner tone="warn">
          {errors.map((e, i) => (
            <span key={i} className="block">
              {e}
            </span>
          ))}
        </Banner>
      )}
      {status === 'published' && <Banner tone="ok">published — changes are live.</Banner>}

      {/* Editor + preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <span className={FIELD_LABEL}>source</span>
          <textarea
            className={`${FIELD_AREA} min-h-[24rem]`}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div>
          <span className={FIELD_LABEL}>preview</span>
          <div className="border border-white/10 p-4 min-h-[24rem]">
            <EditorialBody markdown={text} />
          </div>
        </div>
      </div>

      {/* Publish bar */}
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
