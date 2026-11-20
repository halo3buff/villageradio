'use client';

import { useState } from 'react';
import type { TransmissionItem } from '@/lib/types';
import { keptDest } from '@/lib/transmissions/names';
import { Banner, RowBtn } from './ui';

type Props = { initialItems: TransmissionItem[]; initialArchive: TransmissionItem[]; loadError?: string };
type Notice = { tone: 'ok' | 'warn'; text: string } | null;

function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} mb`;
  return `${Math.max(1, Math.round(bytes / 1024))} kb`;
}

function formatWhen(iso: string): string {
  if (!iso) return '—';
  // ISO → 'YYYY-MM-DD HH:MM' (drop seconds + zone for a compact console line).
  return iso.replace('T', ' ').slice(0, 16);
}

export function ModerationQueue({ initialItems, initialArchive, loadError }: Props) {
  const [items, setItems] = useState<TransmissionItem[]>(initialItems);
  const [archive, setArchive] = useState<TransmissionItem[]>(initialArchive);
  const [view, setView] = useState<'queue' | 'archive'>('queue');
  const [playing, setPlaying] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ name: string; action: 'keep' | 'delete' } | null>(null);
  const [notice, setNotice] = useState<Notice>(loadError ? { tone: 'warn', text: loadError } : null);

  async function moderate(name: string, action: 'keep' | 'delete') {
    setBusy({ name, action });
    setNotice(null);
    try {
      const res = await fetch('/api/admin/transmissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, name }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setNotice({ tone: 'warn', text: `${action} failed — ${b.error ?? res.status}` });
        return;
      }
      const kept = items.find((t) => t.name === name);
      setItems((prev) => prev.filter((t) => t.name !== name));
      setArchive((prev) => {
        const rest = prev.filter((t) => t.name !== name);
        // newest first, like the server lists it
        return action === 'keep' && kept
          ? [...rest, { ...kept, name: keptDest(name), state: 'kept' as const }].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
          : rest;
      });
      if (playing === name) setPlaying(null);
      setNotice({ tone: 'ok', text: action === 'keep' ? 'kept — moved to the archive.' : 'deleted — moved to trash (recoverable).' });
    } catch {
      setNotice({ tone: 'warn', text: `${action} failed — network error` });
    } finally {
      setBusy(null);
      setPendingDelete(null);
    }
  }

  function onDeleteClick(name: string) {
    if (pendingDelete === name) {
      moderate(name, 'delete');
    } else {
      setPendingDelete(name);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-baseline gap-5 mb-1">
        <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/80">transmissions —</h1>
        {(['queue', 'archive'] as const).map((v) => (
          <button key={v} onClick={() => { setView(v); setPlaying(null); setPendingDelete(null); }}
            className={`font-mono text-[11px] tracking-[0.2em] uppercase transition-colors ${view === v ? 'text-white' : 'text-white/35 hover:text-white/70'}`}>
            {v} <span className="text-[9px] tracking-[0.16em]">{v === 'queue' ? items.length : archive.length}</span>
          </button>
        ))}
      </div>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/25 mb-6">
        {view === 'queue'
          ? 'play to review · keep approves (→ archive) · delete moves to trash (recoverable) · actions apply immediately'
          : 'everything kept · play or download to use in house · delete moves to trash (recoverable)'}
      </p>

      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      {(view === 'queue' ? items : archive).length === 0 ? (
        <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/20 py-8">
          {view === 'queue' ? 'no transmissions in the queue' : 'nothing kept yet'}
        </p>
      ) : (
        <ul>
          {(view === 'queue' ? items : archive).map((t) => {
            const isBusy = busy?.name === t.name;
            const confirming = pendingDelete === t.name;
            return (
              <li key={t.name} className="border-b border-white/10 py-3">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-[11px] text-white/80 flex-1 min-w-0 truncate">
                    {t.handle}
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/30 shrink-0">
                    {formatWhen(t.uploadedAt)}
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/25 shrink-0 w-16 text-right">
                    {formatSize(t.sizeBytes)}
                  </span>
                  <span className="flex items-center gap-3 shrink-0 w-44 justify-end">
                    {isBusy ? (
                      <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-white/40">
                        {busy?.action === 'keep' ? 'keeping..' : 'deleting..'}
                      </span>
                    ) : (
                      <>
                        <RowBtn
                          onClick={() => setPlaying(playing === t.name ? null : t.name)}
                          label={playing === t.name ? 'stop' : 'play'}
                        />
                        {view === 'queue' ? (
                          <RowBtn onClick={() => moderate(t.name, 'keep')} label="keep" />
                        ) : (
                          <a href={`/api/admin/transmissions/audio?name=${encodeURIComponent(t.name)}`}
                            download={t.name.slice(t.name.lastIndexOf('/') + 1)}
                            className="font-mono text-[9px] tracking-[0.12em] uppercase text-white/50 hover:text-white transition-colors">
                            download
                          </a>
                        )}
                        {confirming ? (
                          <>
                            <RowBtn onClick={() => onDeleteClick(t.name)} label="confirm?" />
                            <RowBtn onClick={() => setPendingDelete(null)} label="cancel" />
                          </>
                        ) : (
                          <RowBtn onClick={() => onDeleteClick(t.name)} label="delete" />
                        )}
                      </>
                    )}
                  </span>
                </div>
                {playing === t.name && (
                  <audio
                    controls
                    autoPlay
                    src={`/api/admin/transmissions/audio?name=${encodeURIComponent(t.name)}`}
                    className="mt-2 w-full"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
