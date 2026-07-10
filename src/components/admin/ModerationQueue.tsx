'use client';

import { useState } from 'react';
import type { TransmissionItem } from '@/lib/types';
import { Banner, RowBtn } from './ui';

type Props = { initialItems: TransmissionItem[]; loadError?: string };
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

export function ModerationQueue({ initialItems, loadError }: Props) {
  const [items, setItems] = useState<TransmissionItem[]>(initialItems);
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
      setItems((prev) => prev.filter((t) => t.name !== name));
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
      <div className="flex items-baseline gap-4 mb-1">
        <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-black/80">
          transmissions — moderation queue
        </h1>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-black/25">
          {items.length} in queue
        </span>
      </div>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/25 mb-6">
        play to review · keep approves (→ kept) · delete moves to trash (recoverable) · actions apply immediately
      </p>

      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      {items.length === 0 ? (
        <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/20 py-8">
          no transmissions in the queue
        </p>
      ) : (
        <ul>
          {items.map((t) => {
            const isBusy = busy?.name === t.name;
            const confirming = pendingDelete === t.name;
            return (
              <li key={t.name} className="border-b border-black/10 py-3">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-[11px] text-black/80 flex-1 min-w-0 truncate">
                    {t.handle}
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/30 shrink-0">
                    {formatWhen(t.uploadedAt)}
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/25 shrink-0 w-16 text-right">
                    {formatSize(t.sizeBytes)}
                  </span>
                  <span className="flex items-center gap-3 shrink-0 w-44 justify-end">
                    {isBusy ? (
                      <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-black/40">
                        {busy?.action === 'keep' ? 'keeping..' : 'deleting..'}
                      </span>
                    ) : (
                      <>
                        <RowBtn
                          onClick={() => setPlaying(playing === t.name ? null : t.name)}
                          label={playing === t.name ? 'stop' : 'play'}
                        />
                        <RowBtn onClick={() => moderate(t.name, 'keep')} label="keep" />
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
