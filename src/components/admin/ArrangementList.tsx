'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { BroadcastEntry, BroadcastKind, BroadcastSeries } from '@/lib/types';
import {
  moveTo,
  removeEntry,
  addEntry,
  generateEntryId,
  validateManifest,
} from '@/lib/content/arrange';
import {
  formatDuration,
  daySchedule,
  clockTime,
  secondsIntoDay,
  BROADCAST_TZ,
  type Slot,
} from '@/lib/content/broadcast';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);

  // The day as it will actually air: hidden entries drop out, the loop restarts at midnight.
  const onAir = useMemo(() => entries.filter((e) => !e.hidden), [entries]);
  const slots = useMemo(() => daySchedule(onAir.map((e) => e.durationSec)), [onAir]);
  const airTimes = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of slots) {
      const id = onAir[s.idx].id;
      map.set(id, [...(map.get(id) ?? []), s.start]);
    }
    return map;
  }, [slots, onAir]);
  const offAir = entries.filter((e) => e.hidden);
  const selected = entries.find((e) => e.id === selectedId) ?? null;

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

  /** Move the selected entry one slot earlier/later in the day, stepping over hidden entries. */
  function step(dir: -1 | 1) {
    const i = entries.findIndex((e) => e.id === selectedId);
    if (i < 0) return;
    let j = i + dir;
    while (!entries[i].hidden && entries[j]?.hidden) j += dir;
    update(moveTo(entries, i, j));
  }

  const indexOf = (id: string) => entries.findIndex((e) => e.id === id);

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
        <h1 className="font-mono text-[11px] tracking-[0.2em] uppercase text-black/80">
          broadcast — arrangement
        </h1>
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-black/25">
          {entries.length} entries · {formatDuration(totalSec)}
        </span>
      </div>
      <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/25 mb-6">
        the day runs top → bottom from midnight · click a block to edit it · drag blocks to reorder ·
        hide takes an entry off air without removing it · changes are staged until you publish
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

      <DaySummary slots={slots} onAir={onAir} />

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <DayColumn
          slots={slots}
          onAir={onAir}
          hoverId={hoverId}
          selectedId={selectedId}
          onHover={setHoverId}
          onSelect={setSelectedId}
          onDragStart={(id) => (dragIndex.current = indexOf(id))}
          onDropOn={(id) => onDrop(indexOf(id))}
        />

        <aside className="w-full md:w-80 shrink-0 md:sticky md:top-6">
          {selected ? (
            <div className="border border-black/15 p-4 mb-6">
              <div className="flex items-center gap-2">
                {selected.kind === 'mix' && selected.series && (
                  <span className="inline-block w-2 h-2" style={{ backgroundColor: SERIES_INK[selected.series] }} />
                )}
                <span className="font-mono text-[10.5px] text-black/85 truncate">
                  {selected.title || 'untitled'}
                </span>
              </div>
              <p className="font-mono text-[9px] text-black/35 mt-1 leading-relaxed">
                {selected.kind} · {formatDuration(selected.durationSec)} ·{' '}
                {airTimes.has(selected.id)
                  ? `airs ${airTimes.get(selected.id)!.map(clockTime).join(' ')}`
                  : 'off air'}
              </p>
              <div className="flex items-center gap-3 my-4">
                <RowBtn onClick={() => step(-1)} disabled={indexOf(selected.id) === 0} label="↑ earlier" />
                <RowBtn
                  onClick={() => step(1)}
                  disabled={indexOf(selected.id) === entries.length - 1}
                  label="↓ later"
                />
                <RowBtn
                  onClick={() => patch(selected.id, { hidden: !selected.hidden })}
                  label={selected.hidden ? 'unhide' : 'hide'}
                />
                <RowBtn
                  onClick={() => {
                    update(removeEntry(entries, selected.id));
                    setSelectedId(null);
                  }}
                  label="remove"
                />
                <span className="ml-auto">
                  <RowBtn onClick={() => setSelectedId(null)} label="close" />
                </span>
              </div>
              <EntryEditor
                entry={selected}
                onChange={(f) => patch(selected.id, f)}
                className="grid grid-cols-2 gap-x-4 gap-y-3"
              />
            </div>
          ) : (
            <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/30 mb-6">
              click a block to edit it
            </p>
          )}

          {offAir.length > 0 && (
            <div>
              <h2 className="font-mono text-[9px] tracking-[0.18em] uppercase text-black/40 mb-2">
                off air · {offAir.length}
              </h2>
              <ul className="border-t border-black/10">
                {offAir.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2 border-b border-black/10">
                    <button
                      onClick={() => setSelectedId(e.id)}
                      className="font-mono text-[10px] text-black/55 hover:text-black flex-1 min-w-0 truncate text-left"
                    >
                      {e.title || 'untitled'}
                      <span className="text-black/25"> · {formatDuration(e.durationSec)}</span>
                    </button>
                    <RowBtn onClick={() => patch(e.id, { hidden: false })} label="unhide" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

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
            className="font-mono text-[10px] tracking-[0.16em] uppercase text-black/45 hover:text-black border border-black/15 hover:border-black/40 px-3 py-2 transition-colors"
          >
            + add entry
          </button>
        )}
      </div>

      {/* Publish bar */}
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

const DAY = 86_400;
const PX_PER_MIN = 1.6; // whole day ≈ 2300px tall
const y = (sec: number) => (sec / 60) * PX_PER_MIN;

function DaySummary({ slots, onAir }: { slots: Slot[]; onAir: BroadcastEntry[] }) {
  const loopSec = onAir.reduce((s, e) => s + e.durationSec, 0);
  const cut = slots.find((s) => s.cut);
  return (
    <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-black/35 mb-3">
      {slots.length ? (
        <>
          loop {formatDuration(loopSec)} · plays {(DAY / loopSec).toFixed(1)}× a day ·{' '}
          {cut
            ? `midnight cuts "${onAir[cut.idx].title || 'untitled'}" at ${formatDuration(cut.end - cut.start)} of ${formatDuration(onAir[cut.idx].durationSec)}`
            : 'fits the day exactly'}{' '}
          · {BROADCAST_TZ.replace('_', ' ')}
        </>
      ) : (
        'nothing on air — every entry is hidden'
      )}
    </p>
  );
}

/** The whole day as it airs, top → bottom from midnight. First loop solid, repeats faded. */
function DayColumn({
  slots,
  onAir,
  hoverId,
  selectedId,
  onHover,
  onSelect,
  onDragStart,
  onDropOn,
}: {
  slots: Slot[];
  onAir: BroadcastEntry[];
  hoverId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDropOn: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(secondsIntoDay(Date.now()));
    tick();
    // Open scrolled to the current hour.
    if (box.current) box.current.scrollTop = Math.max(0, y(secondsIntoDay(Date.now())) - 120);
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      ref={box}
      className="relative flex-1 w-full min-w-0 max-h-[78vh] overflow-y-auto border border-black/15 bg-black/[0.02]"
    >
      <div className="relative" style={{ height: y(DAY) }}>
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            className="absolute left-0 right-0 border-t border-black/[0.07]"
            style={{ top: y(h * 3600) }}
          >
            <span className="absolute left-2 top-0.5 font-mono text-[8px] text-black/35 tabular-nums">
              {String(h).padStart(2, '0')}:00
            </span>
          </div>
        ))}

        {slots.map((s, k) => {
          const e = onAir[s.idx];
          const ink =
            e.kind === 'mix' ? (e.series ? SERIES_INK[e.series] : '#555555') : 'rgba(0,0,0,0.25)';
          const h = y(s.end - s.start);
          const hot = hoverId === e.id;
          const sel = selectedId === e.id;
          return (
            <div
              key={k}
              draggable
              onDragStart={() => onDragStart(e.id)}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={() => onDropOn(e.id)}
              onClick={() => onSelect(e.id)}
              onMouseEnter={() => onHover(e.id)}
              onMouseLeave={() => onHover(null)}
              title={`${clockTime(s.start)}–${clockTime(s.end)} · ${e.title || 'untitled'}${s.cut ? ' (cut at midnight)' : ''}`}
              className="absolute left-14 right-2 cursor-pointer border-l-[3px] border-b border-b-white/60"
              style={{
                top: y(s.start),
                height: Math.max(h, 2),
                borderLeftColor: ink,
                backgroundColor: e.kind === 'mix' ? `${ink}2e` : 'rgba(0,0,0,0.06)',
                opacity: sel || hot ? 1 : s.loop === 0 ? 0.95 : 0.5,
                outline: sel ? '1.5px solid #000' : hot ? '1px solid rgba(0,0,0,0.35)' : undefined,
                zIndex: sel || hot ? 2 : 1,
              }}
            >
              {/* thin interludes get a taller invisible hit area */}
              {h < 8 && <span className="absolute inset-x-0 -top-1 -bottom-1" />}
              {h >= 14 && (
                <div className="px-2 pt-0.5 font-mono text-[9px] leading-[12px] text-black/75 truncate">
                  <span className="text-black/40 tabular-nums">{clockTime(s.start)}</span>{' '}
                  {e.title || 'untitled'}
                  {h >= 28 && (
                    <span className="block text-black/35">
                      {formatDuration(e.durationSec)}
                      {s.cut && ' · cut at midnight'}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {now !== null && (
          <div
            className="absolute left-0 right-0 h-px bg-[#c0392b] z-10 pointer-events-none"
            style={{ top: y(now) }}
          >
            <span className="absolute left-2 -top-[5px] bg-[#c0392b] px-1 font-mono text-[8px] leading-[10px] text-white">
              {clockTime(now)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function EntryEditor({
  entry,
  onChange,
  className = 'grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-4 pb-5 pl-9 pr-1',
}: {
  entry: BroadcastEntry;
  onChange: (fields: Partial<BroadcastEntry>) => void;
  className?: string;
}) {
  return (
    <div className={className}>
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
        <span className="font-mono text-[10px] text-black/40">
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
      // Step 1: get a presigned R2 URL (avoids Cloud Run's 32 MB body limit).
      const presignRes = await fetch('/api/admin/broadcast/presign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: picked.name }),
      });
      const presignJson = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok || !presignJson.ok) {
        setUploadError(presignJson.error ?? 'presign failed');
        return;
      }

      // Step 2: PUT the file directly to R2.
      const putRes = await fetch(presignJson.url, {
        method: 'PUT',
        headers: { 'content-type': 'audio/mpeg' },
        body: picked,
      });
      if (!putRes.ok) {
        setUploadError('r2 upload failed');
        return;
      }

      // Step 3: probe duration from the local file via the browser audio element.
      const durationSec = await new Promise<number>((resolve, reject) => {
        const url = URL.createObjectURL(picked);
        const audio = new Audio(url);
        audio.addEventListener('loadedmetadata', () => {
          URL.revokeObjectURL(url);
          resolve(Math.round(audio.duration));
        });
        audio.addEventListener('error', () => {
          URL.revokeObjectURL(url);
          reject(new Error('audio decode failed'));
        });
      });

      setUpload({ file: presignJson.key, durationSec });
      if (!title) setTitle(picked.name.replace(/\.[^.]+$/, ''));
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
    <div className="border border-black/15 p-4">
      <div className="flex gap-4 mb-4">
        {(['upload', 'existing'] as AddMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={m === 'existing' && knownFiles.length === 0}
            className={`font-mono text-[8.5px] tracking-[0.18em] uppercase transition-colors disabled:opacity-20 ${
              mode === m ? 'text-white' : 'text-black/30 hover:text-black'
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
              className="block w-full font-mono text-[10px] text-black/50 file:mr-3 file:border file:border-black/20 file:bg-transparent file:px-2 file:py-1 file:font-mono file:text-[9px] file:uppercase file:tracking-[0.16em] file:text-black/70 hover:file:border-black/50"
            />
            <span className="block mt-1 font-mono text-[8px] tracking-[0.14em] uppercase text-black/30">
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
          className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-black border border-black/20 hover:border-black/60 px-3 py-2 transition-colors disabled:opacity-30 disabled:hover:border-black/20"
        >
          add ▸
        </button>
        <button
          onClick={onCancel}
          className="font-mono text-[9px] tracking-[0.16em] uppercase text-black/30 hover:text-black transition-colors"
        >
          cancel
        </button>
        <span className="font-mono text-[8px] tracking-[0.16em] uppercase text-black/25 ml-auto">
          {selected ? formatDuration(selected.durationSec) : 'no file'}
        </span>
      </div>
    </div>
  );
}
