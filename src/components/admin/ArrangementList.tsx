'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { BroadcastEntry, BroadcastKind, BroadcastSeries } from '@/lib/types';
import {
  moveUp,
  moveDown,
  moveTo,
  removeEntry,
  addEntry,
  generateEntryId,
  validateManifest,
} from '@/lib/content/arrange';
import { formatDuration } from '@/lib/content/broadcast';
import { Banner, RowBtn, FIELD, FIELD_LABEL } from './ui';

type Props = { initialEntries: BroadcastEntry[]; generation: string };
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';

const SERIES_INK: Record<BroadcastSeries, string> = {
  red: '#a24b3f',
  green: '#6f8f5f',
  yellow: '#b89a3e',
};

/** Drop a series when an entry is an interlude; interludes also carry no date. */
function normalize(e: BroadcastEntry): BroadcastEntry {
  if (e.kind === 'inter') {
    const rest = { ...e, date: '' };
    delete rest.series;
    return rest;
  }
  return e;
}

export function ArrangementList({ initialEntries, generation: initialGen }: Props) {
  const [entries, setEntries] = useState<BroadcastEntry[]>(initialEntries);
  const [baseline, setBaseline] = useState<BroadcastEntry[]>(initialEntries);
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(entries) !== JSON.stringify(baseline),
    [entries, baseline],
  );
  const totalSec = useMemo(() => entries.reduce((s, e) => s + (e.durationSec || 0), 0), [entries]);
  const knownFiles = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) if (!map.has(e.file)) map.set(e.file, e.durationSec);
    return [...map.entries()].map(([file, durationSec]) => ({ file, durationSec }));
  }, [entries]);

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

  function update(next: BroadcastEntry[]) {
    setEntries(next);
    if (status !== 'idle') setStatus('idle');
  }

  function patch(id: string, fields: Partial<BroadcastEntry>) {
    update(entries.map((e) => (e.id === id ? normalize({ ...e, ...fields }) : e)));
  }

  function onDrop(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === target) return;
    update(moveTo(entries, from, target));
  }

  async function publish() {
    const check = validateManifest({ version: 1, entries });
    if (!check.ok) {
      setErrors(check.errors);
      setStatus('error');
      return;
    }
    setErrors([]);
    setStatus('publishing');
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manifest: { version: 1, entries }, generation }),
      });
      if (res.status === 409) {
        setStatus('conflict');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrors(body.details ?? [body.error ?? 'publish failed']);
        setStatus('error');
        return;
      }
      const body = await res.json();
      setGeneration(body.generation);
      setBaseline(entries);
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
        <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/80">
          broadcast — arrangement
        </h1>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-white/25">
          {entries.length} entries · {formatDuration(totalSec)}
        </span>
      </div>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/25 mb-6">
        play order is top → bottom · drag or use ↑↓ · changes are staged until you publish
      </p>

      {/* Banners */}
      {status === 'conflict' && (
        <Banner tone="warn">
          the live lineup changed elsewhere — reload the page to get the latest, then redo your
          edits.
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

      {/* List */}
      <ul className="border-t border-white/10">
        {entries.map((entry, i) => (
          <li
            key={entry.id}
            draggable={editingId !== entry.id}
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            className="border-b border-white/10"
          >
            <div className="flex items-center gap-3 py-2.5">
              <span className="font-mono text-[9px] text-white/20 w-6 shrink-0 text-right">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-mono text-[10px] text-white/15 shrink-0 cursor-grab select-none">
                ⠿
              </span>
              <span className="shrink-0 w-3">
                {entry.kind === 'mix' && entry.series && (
                  <span
                    className="inline-block w-2 h-2 align-middle"
                    style={{ backgroundColor: SERIES_INK[entry.series] }}
                    title={entry.series}
                  />
                )}
              </span>
              <span className="font-mono text-[10px] text-white/80 flex-1 min-w-0 truncate">
                {entry.title || <span className="text-white/30">untitled</span>}
                <span className="text-white/25"> · {entry.kind}</span>
              </span>
              <span className="font-mono text-[9px] text-white/30 w-20 shrink-0 truncate">
                {entry.date}
              </span>
              <span className="font-mono text-[9px] text-white/30 w-12 shrink-0 text-right">
                {formatDuration(entry.durationSec)}
              </span>
              <span className="flex items-center gap-2 shrink-0 ml-1">
                <RowBtn onClick={() => update(moveUp(entries, i))} disabled={i === 0} label="↑" />
                <RowBtn
                  onClick={() => update(moveDown(entries, i))}
                  disabled={i === entries.length - 1}
                  label="↓"
                />
                <RowBtn
                  onClick={() => setEditingId(editingId === entry.id ? null : entry.id)}
                  label={editingId === entry.id ? 'close' : 'edit'}
                />
                <RowBtn onClick={() => update(removeEntry(entries, entry.id))} label="remove" />
              </span>
            </div>

            {editingId === entry.id && (
              <EntryEditor entry={entry} onChange={(f) => patch(entry.id, f)} />
            )}
          </li>
        ))}
      </ul>

      {/* Add */}
      <div className="mt-5">
        {adding ? (
          <AddPanel
            knownFiles={knownFiles}
            existingIds={entries.map((e) => e.id)}
            onAdd={(entry) => {
              update(addEntry(entries, entry));
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/45 hover:text-white border border-white/15 hover:border-white/40 px-3 py-2 transition-colors"
          >
            + add entry
          </button>
        )}
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

function EntryEditor({
  entry,
  onChange,
}: {
  entry: BroadcastEntry;
  onChange: (fields: Partial<BroadcastEntry>) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-4 pb-5 pl-9 pr-1">
      <label className="col-span-2">
        <span className={FIELD_LABEL}>title</span>
        <input className={FIELD} value={entry.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label>
        <span className={FIELD_LABEL}>artist</span>
        <input className={FIELD} value={entry.artist} onChange={(e) => onChange({ artist: e.target.value })} />
      </label>
      <label>
        <span className={FIELD_LABEL}>kind</span>
        <select
          className={FIELD}
          value={entry.kind}
          onChange={(e) => onChange({ kind: e.target.value as BroadcastKind })}
        >
          <option value="mix">mix</option>
          <option value="inter">inter</option>
        </select>
      </label>
      {entry.kind === 'mix' && (
        <>
          <label>
            <span className={FIELD_LABEL}>date (MM-DD-YYYY)</span>
            <input
              className={FIELD}
              value={entry.date}
              placeholder="05-20-2026"
              onChange={(e) => onChange({ date: e.target.value })}
            />
          </label>
          <label>
            <span className={FIELD_LABEL}>series</span>
            <select
              className={FIELD}
              value={entry.series ?? ''}
              onChange={(e) =>
                onChange({ series: e.target.value ? (e.target.value as BroadcastSeries) : undefined })
              }
            >
              <option value="">none</option>
              <option value="red">red</option>
              <option value="green">green</option>
              <option value="yellow">yellow</option>
            </select>
          </label>
        </>
      )}
      <label>
        <span className={FIELD_LABEL}>tags (comma-separated)</span>
        <input
          className={FIELD}
          value={entry.tags.join(', ')}
          onChange={(e) =>
            onChange({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })
          }
        />
      </label>
      <div>
        <span className={FIELD_LABEL}>file · duration</span>
        <span className="font-mono text-[10px] text-white/40">
          {entry.file} · {formatDuration(entry.durationSec)}
        </span>
      </div>
    </div>
  );
}

type AddMode = 'existing' | 'upload';

function AddPanel({
  knownFiles,
  existingIds,
  onAdd,
  onCancel,
}: {
  knownFiles: { file: string; durationSec: number }[];
  existingIds: string[];
  onAdd: (entry: BroadcastEntry) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<AddMode>(knownFiles.length ? 'existing' : 'upload');
  const [existingFile, setExistingFile] = useState(knownFiles[0]?.file ?? '');
  const [upload, setUpload] = useState<{ file: string; durationSec: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('Village Radio');
  const [kind, setKind] = useState<BroadcastKind>('mix');
  const [date, setDate] = useState('');
  const [series, setSeries] = useState<BroadcastSeries | ''>('');

  const selected =
    mode === 'upload'
      ? upload
      : knownFiles.find((f) => f.file === existingFile) ?? null;

  async function uploadAudio(picked: File) {
    setUploading(true);
    setUploadError('');
    setUpload(null);
    try {
      const body = new FormData();
      body.append('audio', picked);
      body.append('filename', picked.name);
      const res = await fetch('/api/admin/broadcast/upload', { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setUploadError(json.error ?? 'upload failed');
      } else {
        setUpload({ file: json.file, durationSec: json.durationSec });
        if (!title) setTitle(picked.name.replace(/\.[^.]+$/, ''));
      }
    } catch {
      setUploadError('network error');
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!selected) return;
    const id = generateEntryId(selected.file, existingIds);
    const entry: BroadcastEntry = normalize({
      id,
      title,
      artist,
      date,
      durationSec: selected.durationSec,
      file: selected.file,
      kind,
      ...(kind === 'mix' && series ? { series } : {}),
      tags: [],
    });
    onAdd(entry);
  }

  return (
    <div className="border border-white/15 p-4">
      <div className="flex gap-4 mb-4">
        {(['upload', 'existing'] as AddMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={m === 'existing' && knownFiles.length === 0}
            className={`font-mono text-[8.5px] tracking-[0.18em] uppercase transition-colors disabled:opacity-20 ${
              mode === m ? 'text-white' : 'text-white/30 hover:text-white'
            }`}
          >
            {m === 'upload' ? 'upload new audio' : 'existing file'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-4">
        {mode === 'existing' ? (
          <label>
            <span className={FIELD_LABEL}>file</span>
            <select className={FIELD} value={existingFile} onChange={(e) => setExistingFile(e.target.value)}>
              {knownFiles.map((f) => (
                <option key={f.file} value={f.file}>
                  {f.file}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="col-span-2">
            <span className={FIELD_LABEL}>audio file (.mp3)</span>
            <input
              type="file"
              accept="audio/mpeg"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && uploadAudio(e.target.files[0])}
              className="block w-full font-mono text-[10px] text-white/50 file:mr-3 file:border file:border-white/20 file:bg-transparent file:px-2 file:py-1 file:font-mono file:text-[9px] file:uppercase file:tracking-[0.16em] file:text-white/70 hover:file:border-white/50"
            />
            <span className="block mt-1 font-mono text-[8px] tracking-[0.14em] uppercase text-white/30">
              {uploading
                ? 'uploading + probing..'
                : uploadError
                  ? uploadError
                  : upload
                    ? `${upload.file} · ${formatDuration(upload.durationSec)}`
                    : 'no file uploaded'}
            </span>
          </label>
        )}

        <label>
          <span className={FIELD_LABEL}>kind</span>
          <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value as BroadcastKind)}>
            <option value="mix">mix</option>
            <option value="inter">inter</option>
          </select>
        </label>
        <label className="col-span-2 md:col-span-1">
          <span className={FIELD_LABEL}>title</span>
          <input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          <span className={FIELD_LABEL}>artist</span>
          <input className={FIELD} value={artist} onChange={(e) => setArtist(e.target.value)} />
        </label>
        {kind === 'mix' && (
          <>
            <label>
              <span className={FIELD_LABEL}>date (MM-DD-YYYY)</span>
              <input
                className={FIELD}
                value={date}
                placeholder="05-20-2026"
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              <span className={FIELD_LABEL}>series</span>
              <select className={FIELD} value={series} onChange={(e) => setSeries(e.target.value as BroadcastSeries | '')}>
                <option value="">none</option>
                <option value="red">red</option>
                <option value="green">green</option>
                <option value="yellow">yellow</option>
              </select>
            </label>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={submit}
          disabled={!selected || uploading}
          className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-white border border-white/20 hover:border-white/60 px-3 py-2 transition-colors disabled:opacity-30 disabled:hover:border-white/20"
        >
          add ▸
        </button>
        <button
          onClick={onCancel}
          className="font-mono text-[9px] tracking-[0.16em] uppercase text-white/30 hover:text-white transition-colors"
        >
          cancel
        </button>
        <span className="font-mono text-[8px] tracking-[0.16em] uppercase text-white/25 ml-auto">
          {selected ? formatDuration(selected.durationSec) : 'no file'}
        </span>
      </div>
    </div>
  );
}
