'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import type { BroadcastEntry, BroadcastKind, BroadcastSeries } from '@/lib/types';
import {
  moveTo,
  placeEntry,
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
import { Banner, FIELD, FIELD_LABEL } from './ui';

type Props = { initialEntries: BroadcastEntry[]; generation: string };
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';

const SERIES_INK: Record<BroadcastSeries, string> = {
  red: '#d0644f',
  green: '#7fae6b',
  yellow: '#d9b44a',
};
const inkOf = (e: BroadcastEntry) =>
  e.kind === 'mix' ? (e.series ? SERIES_INK[e.series] : '#c8c4bb') : '#8b8b8b';

const DAY = 86_400;
const ZOOMS = [1, 2, 4]; // px per minute
const NOW_RED = '#ff4d3d';

const INPUT =
  'w-full rounded-md bg-white/[0.04] border border-white/10 px-2.5 h-8 font-sans text-[12.5px] text-white outline-none focus:border-white/35 transition-colors placeholder:text-white/25';
const LABEL = 'block font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/40 mb-1.5';
const BTN =
  'h-8 rounded-md border border-white/12 px-3 font-sans text-[12px] text-white/80 hover:bg-white/[0.06] hover:text-white active:scale-[0.97] transition-[transform,background-color,color] duration-150 disabled:opacity-30 disabled:pointer-events-none';

/** Drop a series when an entry is an interlude; interludes also carry no date. */
function normalize(e: BroadcastEntry): BroadcastEntry {
  if (e.kind === 'inter') {
    const rest = { ...e, date: '' };
    delete rest.series;
    return rest;
  }
  return e;
}

type DropTarget = { kind: 'day'; id: string | null; after: boolean; at: number } | { kind: 'library' };
type Drag = {
  id: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  target: DropTarget | null;
};

export function ArrangementList({ initialEntries, generation: initialGen }: Props) {
  const [entries, setEntries] = useState<BroadcastEntry[]>(initialEntries);
  const [baseline, setBaseline] = useState<BroadcastEntry[]>(initialEntries);
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [past, setPast] = useState<BroadcastEntry[][]>([]);
  const [future, setFuture] = useState<BroadcastEntry[][]>([]);
  const [ppm, setPpm] = useState(2);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const lastEdit = useRef<string | null>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);

  // The day as it will actually air: hidden entries drop out, the loop restarts at midnight.
  const onAir = useMemo(() => entries.filter((e) => !e.hidden), [entries]);
  const offAir = useMemo(() => entries.filter((e) => e.hidden), [entries]);
  const slots = useMemo(() => daySchedule(onAir.map((e) => e.durationSec)), [onAir]);
  const airTimes = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of slots) {
      const id = onAir[s.idx].id;
      map.set(id, [...(map.get(id) ?? []), s.start]);
    }
    return map;
  }, [slots, onAir]);
  const loopSec = onAir.reduce((s, e) => s + e.durationSec, 0);
  const cut = slots.find((s) => s.cut);
  const live = now === null ? undefined : slots.find((s) => now >= s.start && now < s.end);
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const dirty = useMemo(
    () => JSON.stringify(entries) !== JSON.stringify(baseline),
    [entries, baseline],
  );
  const knownFiles = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) if (!map.has(e.file)) map.set(e.file, e.durationSec);
    return [...map.entries()].map(([file, durationSec]) => ({ file, durationSec }));
  }, [entries]);

  const y = (sec: number) => (sec / 60) * ppm;
  const indexOf = (id: string) => entries.findIndex((e) => e.id === id);

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

  // Clock for the now-line / now-playing.
  useEffect(() => {
    const tick = () => setNow(secondsIntoDay(Date.now()));
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);

  // Open on the current hour.
  useEffect(() => {
    scrollToSec(secondsIntoDay(Date.now()), 'instant');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scrollToSec(sec: number, behavior: ScrollBehavior, px = ppm) {
    const el = dayRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top + (sec / 60) * px - window.innerHeight / 3), behavior });
  }

  /** Change zoom, keeping the time under the middle of the screen in place. */
  function zoomTo(next: number) {
    const el = dayRef.current;
    if (!el || next === ppm) return;
    const mid = ((window.innerHeight / 2 - el.getBoundingClientRect().top) / ppm) * 60;
    setPpm(next);
    requestAnimationFrame(() => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + (mid / 60) * next - window.innerHeight / 2 });
    });
  }

  /** Every change goes through here. Consecutive edits to the same field collapse into one undo step. */
  function update(next: BroadcastEntry[], editKey: string | null = null) {
    if (editKey === null || editKey !== lastEdit.current) {
      setPast((p) => [...p.slice(-99), entries]);
      setFuture([]);
    }
    lastEdit.current = editKey;
    setEntries(next);
    if (status !== 'idle') setStatus('idle');
  }

  function patch(id: string, fields: Partial<BroadcastEntry>, editKey: string | null = null) {
    update(
      entries.map((e) => (e.id === id ? normalize({ ...e, ...fields }) : e)),
      editKey && `${id}:${editKey}`,
    );
  }

  function undo() {
    if (!past.length) return;
    setFuture((f) => [entries, ...f]);
    setEntries(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    lastEdit.current = null;
  }

  function redo() {
    if (!future.length) return;
    setPast((p) => [...p, entries]);
    setEntries(future[0]);
    setFuture((f) => f.slice(1));
    lastEdit.current = null;
  }

  /** Move the selected entry one slot earlier/later in the day, stepping over hidden entries. */
  function step(dir: -1 | 1) {
    const i = indexOf(selectedId ?? '');
    if (i < 0) return;
    let j = i + dir;
    while (!entries[i].hidden && entries[j]?.hidden) j += dir;
    update(moveTo(entries, i, j));
  }

  function duplicate(id: string) {
    const i = indexOf(id);
    const copy = { ...entries[i], id: generateEntryId(entries[i].file, entries.map((e) => e.id)) };
    const next = entries.slice();
    next.splice(i + 1, 0, copy);
    update(next);
    setSelectedId(copy.id);
  }

  // Keyboard: undo/redo, Alt+↑↓ to move the selection, Esc to deselect.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (adding) return;
      const typing = (e.target as HTMLElement).closest('input, textarea, select');
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        if (typing) (e.target as HTMLElement).blur();
        else setSelectedId(null);
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && selectedId && !typing) {
        e.preventDefault();
        step(e.key === 'ArrowUp' ? -1 : 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- Drag: pointer-driven so it works the same from library cards and timeline blocks ---------
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  function targetAt(x: number, yPx: number, draggingId: string): DropTarget | null {
    const lib = libraryRef.current?.getBoundingClientRect();
    if (lib && x >= lib.left && x <= lib.right && yPx >= lib.top && yPx <= lib.bottom) {
      return entries.find((e) => e.id === draggingId)?.hidden ? null : { kind: 'library' };
    }
    const day = dayRef.current?.getBoundingClientRect();
    if (!day || x < day.left || x > day.right) return null;
    if (!slots.length) return { kind: 'day', id: null, after: false, at: 0 };
    const sec = Math.min(Math.max(((yPx - day.top) / ppm) * 60, 0), DAY - 1);
    const s = slots.find((t) => sec >= t.start && sec < t.end) ?? slots[slots.length - 1];
    const after = sec > (s.start + s.end) / 2;
    const id = onAir[s.idx].id;
    if (id === draggingId) return null;
    return { kind: 'day', id, after, at: after ? s.end : s.start };
  }

  function startDrag(id: string, e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    setDrag({ id, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, target: null });
  }

  // Layout effect: listeners must be live before the browser can deliver the pointerup.
  useLayoutEffect(() => {
    if (!drag) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (e.buttons === 0) return up(); // released somewhere we never heard about
      const active = d.active || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4;
      setDrag({ ...d, x: e.clientX, y: e.clientY, active, target: active ? targetAt(e.clientX, e.clientY, d.id) : null });
    };
    function up() {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (!d.active) setSelectedId(d.id);
      else if (d.target?.kind === 'library') patch(d.id, { hidden: true });
      else if (d.target?.kind === 'day') {
        update(placeEntry(entries, d.id, d.target.id, d.target.after));
        setSelectedId(d.id);
      }
    }
    // Auto-scroll near the top/bottom edge while dragging.
    const edge = () => {
      const d = dragRef.current;
      if (d?.active) {
        const zone = 90;
        const v = d.y < zone ? -(zone - d.y) / 4 : d.y > window.innerHeight - zone ? (d.y - window.innerHeight + zone) / 4 : 0;
        if (v) {
          window.scrollBy(0, v);
          setDrag({ ...d, target: targetAt(d.x, d.y, d.id) });
        }
      }
      raf = requestAnimationFrame(edge);
    };
    raf = requestAnimationFrame(edge);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    document.body.style.userSelect = 'none';
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
    };
    // Re-binding on every drag frame would drop the `once` pointerup; deps are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

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

  const q = query.trim().toLowerCase();
  const matches = (e: BroadcastEntry) =>
    !q || e.title.toLowerCase().includes(q) || e.file.toLowerCase().includes(q);
  const dragging = drag?.active ? entries.find((e) => e.id === drag.id) : undefined;
  const dayTarget = drag?.active && drag.target?.kind === 'day' ? drag.target : null;

  return (
    <div className={drag?.active ? 'cursor-grabbing' : ''}>
      {/* Toolbar */}
      <div className="sticky top-0 z-40 -mx-6 -mt-7 mb-5 px-6 h-14 flex items-center gap-4 border-b border-white/10 bg-black/85 backdrop-blur-md">
        <h1 className="font-sans text-[15px] font-medium text-white">Broadcast</h1>
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-white/50">
          <Chip>{onAir.length} on air</Chip>
          {loopSec > 0 && <Chip>loop {formatDuration(loopSec)}</Chip>}
          {loopSec > 0 && <Chip>{(DAY / loopSec).toFixed(1)}× a day</Chip>}
          {cut && (
            <Chip warn title="The loop restarts at midnight, cutting this entry short">
              midnight cuts {onAir[cut.idx].title || 'untitled'} at {formatDuration(cut.end - cut.start)}
            </Chip>
          )}
        </div>

        {live && now !== null && (
          <button
            onClick={() => scrollToSec(now, 'smooth')}
            className="ml-2 flex items-center gap-2 min-w-0 rounded-full border border-white/10 pl-2.5 pr-3 h-7 hover:bg-white/[0.05] transition-colors"
            title="Jump to now"
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: NOW_RED }} />
            <span className="font-sans text-[12px] text-white/85 truncate max-w-[220px]">
              {onAir[live.idx].title || 'untitled'}
            </span>
            <span className="font-mono text-[10.5px] text-white/40 tabular-nums">
              {formatDuration(live.end - now)} left
            </span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-white/12 p-0.5" title="Zoom">
            {ZOOMS.map((z) => (
              <button
                key={z}
                onClick={() => zoomTo(z)}
                className={`h-6 px-2 rounded font-mono text-[10.5px] transition-colors ${
                  ppm === z ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'
                }`}
              >
                {z}×
              </button>
            ))}
          </div>
          <button onClick={undo} disabled={!past.length} className={BTN} title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button onClick={redo} disabled={!future.length} className={BTN} title="Redo (Ctrl+Shift+Z)">
            ↷
          </button>
          <span className="w-28 text-right font-mono text-[10.5px] text-white/40">
            {status === 'published' ? 'published' : dirty ? 'unpublished changes' : 'up to date'}
          </span>
          <button
            onClick={publish}
            disabled={!dirty || status === 'publishing'}
            className="h-8 rounded-md bg-white px-4 font-sans text-[12.5px] font-medium text-black hover:bg-white/90 active:scale-[0.97] transition-[transform,background-color] duration-150 disabled:bg-white/10 disabled:text-white/30 disabled:pointer-events-none"
          >
            {status === 'publishing' ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      {status === 'conflict' && (
        <Banner tone="warn">
          the live lineup changed elsewhere — reload the page to get the latest, then redo your edits.
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

      <div className="grid grid-cols-[260px_minmax(0,1fr)_320px] gap-6 items-start">
        {/* Library */}
        <div
          ref={libraryRef}
          className={`sticky top-[72px] max-h-[calc(100vh-150px)] overflow-y-auto rounded-lg border p-3 transition-colors ${
            drag?.target?.kind === 'library'
              ? 'border-white/40 bg-white/[0.04]'
              : 'border-white/10'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-sans text-[13px] font-medium text-white/90">Library</span>
            <button onClick={() => setAdding(true)} className={`${BTN} h-7 px-2.5`}>
              + Add
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className={`${INPUT} mb-4`}
          />
          {dragging && !dragging.hidden && (
            <p className="mb-3 rounded-md border border-dashed border-white/25 px-2.5 py-2 font-sans text-[11.5px] text-white/60">
              Drop here to take it off air
            </p>
          )}
          <LibrarySection
            title={`On air · ${onAir.length}`}
            items={onAir.filter(matches)}
            selectedId={selectedId}
            dragId={drag?.active ? drag.id : null}
            onPointerDown={startDrag}
          />
          <LibrarySection
            title={`Off air · ${offAir.length}`}
            items={offAir.filter(matches)}
            selectedId={selectedId}
            dragId={drag?.active ? drag.id : null}
            onPointerDown={startDrag}
            dim
          />
        </div>

        {/* The day */}
        <div className="min-w-0">
          <div ref={dayRef} className="relative" style={{ height: y(DAY) }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute left-0 right-0" style={{ top: y(h * 3600) }}>
                <div className="ml-14 border-t border-white/[0.07]" />
                {ppm >= 2 && (
                  <div className="ml-14 border-t border-dashed border-white/[0.04]" style={{ marginTop: y(1800) - 1 }} />
                )}
                <span
                  className={`absolute top-0 left-0 w-11 text-right font-mono text-[10px] text-white/35 tabular-nums ${
                    h ? '-translate-y-1/2' : ''
                  }`}
                >
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}

            {slots.map((s, k) => (
              <Block
                key={k}
                slot={s}
                entry={onAir[s.idx]}
                top={y(s.start)}
                height={y(s.end - s.start)}
                selected={selectedId === onAir[s.idx].id}
                ghosted={drag?.active === true && drag.id === onAir[s.idx].id}
                showLoop={s.loop > 0 && s.idx === 0 && y(loopSec) >= 40}
                onPointerDown={startDrag}
              />
            ))}

            {!slots.length && (
              <div className="absolute left-14 right-0 top-8 rounded-lg border border-dashed border-white/15 p-8 text-center font-sans text-[13px] text-white/45">
                Nothing on air. Drag something in from the library.
              </div>
            )}

            {dayTarget && (
              <div
                className="absolute left-12 right-0 z-30 h-[2px] rounded-full bg-white pointer-events-none"
                style={{ top: y(dayTarget.at) - 1 }}
              >
                <span className="absolute left-0 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white" />
                <span className="absolute right-2 -translate-y-1/2 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-black">
                  {dayTarget.id === null
                    ? 'add to the day'
                    : `${dayTarget.after ? 'after' : 'before'} ${onAir.find((e) => e.id === dayTarget.id)?.title || 'untitled'}`}
                </span>
              </div>
            )}

            {now !== null && (
              <div
                className="absolute left-12 right-0 z-20 h-px pointer-events-none"
                style={{ top: y(now), background: NOW_RED }}
              >
                <span
                  className="absolute -left-12 -translate-y-1/2 rounded px-1 font-mono text-[10px] leading-[15px] text-white tabular-nums"
                  style={{ background: NOW_RED }}
                >
                  {clockTime(now)}
                </span>
              </div>
            )}
          </div>
          <p className="mt-3 ml-14 font-mono text-[10px] text-white/30">
            day starts 00:00 · {BROADCAST_TZ.replace('_', ' ')}
          </p>
        </div>

        {/* Inspector */}
        <div className="sticky top-[72px] max-h-[calc(100vh-150px)] overflow-y-auto">
          {selected ? (
            <Inspector
              entry={selected}
              airs={airTimes.get(selected.id) ?? []}
              isFirst={indexOf(selected.id) === 0}
              isLast={indexOf(selected.id) === entries.length - 1}
              onPatch={(f, key) => patch(selected.id, f, key)}
              onStep={step}
              onDuplicate={() => duplicate(selected.id)}
              onRemove={() => {
                update(removeEntry(entries, selected.id));
                setSelectedId(null);
              }}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-white/12 p-5 font-sans text-[12.5px] leading-relaxed text-white/45">
              <p className="text-white/70 mb-2">Nothing selected</p>
              <p>Click a block or a library item to edit it.</p>
              <p className="mt-2">Drag from the library onto the day to put something on air. Drag a block back to the library to take it off.</p>
              <div className="mt-4 space-y-1 font-mono text-[10.5px] text-white/35">
                <p><Kbd>Ctrl Z</Kbd> undo · <Kbd>Ctrl ⇧ Z</Kbd> redo</p>
                <p><Kbd>Alt ↑↓</Kbd> move selected · <Kbd>Esc</Kbd> deselect</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drag ghost */}
      {dragging && drag && (
        <div
          className="fixed z-50 pointer-events-none flex items-center gap-2 rounded-md border border-white/15 bg-[#161616]/95 px-3 h-8 shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
          style={{ left: drag.x + 14, top: drag.y + 10 }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: inkOf(dragging) }} />
          <span className="font-sans text-[12px] text-white/90 max-w-[220px] truncate">
            {dragging.title || 'untitled'}
          </span>
          <span className="font-mono text-[10px] text-white/40">{formatDuration(dragging.durationSec)}</span>
        </div>
      )}

      {adding && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 backdrop-blur-sm px-6 pt-[12vh]"
          onPointerDown={(e) => e.target === e.currentTarget && setAdding(false)}
        >
          <div className="w-full max-w-2xl rounded-lg bg-[#0d0d0d] shadow-2xl">
            <AddPanel
              knownFiles={knownFiles}
              existingIds={entries.map((e) => e.id)}
              onAdd={(entry) => {
                update(addEntry(entries, entry));
                setAdding(false);
                setSelectedId(entry.id);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children, warn, title }: { children: React.ReactNode; warn?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`rounded-full border px-2 h-6 inline-flex items-center whitespace-nowrap ${
        warn ? 'border-[#d9b44a]/30 text-[#d9b44a]/85' : 'border-white/10'
      }`}
    >
      {children}
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-white/15 px-1 text-white/55">{children}</span>;
}

function LibrarySection({
  title,
  items,
  selectedId,
  dragId,
  onPointerDown,
  dim,
}: {
  title: string;
  items: BroadcastEntry[];
  selectedId: string | null;
  dragId: string | null;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  dim?: boolean;
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 px-1 font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/35">{title}</h3>
      {items.length === 0 && <p className="px-1 font-sans text-[11.5px] text-white/25">—</p>}
      {items.map((e) => (
        <div
          key={e.id}
          onPointerDown={(ev) => onPointerDown(e.id, ev)}
          className={`flex items-center gap-2.5 rounded-md px-2 h-8 cursor-grab select-none transition-colors ${
            selectedId === e.id ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
          } ${dragId === e.id ? 'opacity-30' : ''}`}
        >
          <span className="w-2 h-2 shrink-0 rounded-full" style={{ background: inkOf(e), opacity: dim ? 0.5 : 1 }} />
          <span className={`font-sans text-[12.5px] truncate ${dim ? 'text-white/45' : 'text-white/85'}`}>
            {e.title || 'untitled'}
          </span>
          <span className="ml-auto font-mono text-[10px] text-white/30 tabular-nums">
            {formatDuration(e.durationSec)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Block({
  slot: s,
  entry: e,
  top,
  height: h,
  selected,
  ghosted,
  showLoop,
  onPointerDown,
}: {
  slot: Slot;
  entry: BroadcastEntry;
  top: number;
  height: number;
  selected: boolean;
  ghosted: boolean;
  showLoop: boolean;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
}) {
  const ink = inkOf(e);
  return (
    <>
      {showLoop && (
        <span
          className="absolute left-[46px] -translate-y-1/2 font-mono text-[10px] leading-none text-white/30"
          style={{ top }}
          title={`loop ${s.loop + 1} starts`}
        >
          ↻
        </span>
      )}
      <div
        onPointerDown={(ev) => onPointerDown(e.id, ev)}
        className={`absolute left-14 right-0 cursor-grab select-none overflow-visible transition-[filter,opacity] duration-150 hover:brightness-125 ${
          h >= 8 ? 'rounded-[6px]' : 'rounded-[2px]'
        }`}
        style={{
          top: top + 1,
          height: Math.max(h - 2, 2),
          background: `color-mix(in oklab, ${ink} ${selected ? 36 : 22}%, #0c0c0c)`,
          boxShadow: `inset 3px 0 0 ${ink}${selected ? ', 0 0 0 1.5px rgba(255,255,255,0.85)' : ''}`,
          opacity: ghosted ? 0.3 : selected || s.loop === 0 ? 1 : 0.55,
          zIndex: selected ? 2 : 1,
        }}
      >
        {/* thin interludes get a taller invisible grab area */}
        {h < 10 && <span className="absolute inset-x-0 -top-1.5 -bottom-1.5" />}
        {h >= 20 && (
          <div className="flex items-baseline gap-3 px-3 pt-[4px] min-w-0">
            <span className="font-sans text-[12.5px] font-medium text-white/90 truncate">
              {e.title || 'untitled'}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-white/40 tabular-nums">
              {clockTime(s.start)} – {clockTime(s.end)}
            </span>
          </div>
        )}
        {h >= 38 && (
          <div className="px-3 font-mono text-[10px] text-white/35">
            {formatDuration(e.durationSec)}
            {e.kind === 'inter' ? ' · interlude' : e.series ? ` · ${e.series}` : ''}
            {s.cut && ' · cut at midnight'}
          </div>
        )}
      </div>
    </>
  );
}

function Inspector({
  entry,
  airs,
  isFirst,
  isLast,
  onPatch,
  onStep,
  onDuplicate,
  onRemove,
  onClose,
}: {
  entry: BroadcastEntry;
  airs: number[];
  isFirst: boolean;
  isLast: boolean;
  onPatch: (fields: Partial<BroadcastEntry>, editKey?: string) => void;
  onStep: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [allTimes, setAllTimes] = useState(false);
  const shown = allTimes ? airs : airs.slice(0, 12);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-1 h-9 shrink-0 rounded-full" style={{ background: inkOf(entry) }} />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[15px] font-medium text-white truncate">{entry.title || 'untitled'}</p>
          <p className="font-mono text-[10.5px] text-white/40">
            {entry.kind === 'inter' ? 'interlude' : 'mix'} · {formatDuration(entry.durationSec)} ·{' '}
            {entry.hidden ? 'off air' : `${airs.length}× a day`}
          </p>
        </div>
        <button onClick={onClose} className="text-white/35 hover:text-white text-[16px] leading-none" title="Close (Esc)">
          ×
        </button>
      </div>

      {airs.length > 0 && (
        <div className="mt-4">
          <span className={LABEL}>Airs at</span>
          <div className="flex flex-wrap gap-1">
            {shown.map((t, i) => (
              <span key={i} className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10.5px] text-white/70 tabular-nums">
                {clockTime(t)}
              </span>
            ))}
            {airs.length > 12 && (
              <button
                onClick={() => setAllTimes(!allTimes)}
                className="rounded px-1.5 py-0.5 font-mono text-[10.5px] text-white/45 hover:text-white"
              >
                {allTimes ? 'less' : `+${airs.length - 12} more`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => onStep(-1)} disabled={isFirst} className={BTN}>↑ Earlier</button>
        <button onClick={() => onStep(1)} disabled={isLast} className={BTN}>↓ Later</button>
        <button onClick={onDuplicate} className={BTN}>Duplicate</button>
        <button onClick={() => onPatch({ hidden: !entry.hidden })} className={BTN}>
          {entry.hidden ? 'Put on air' : 'Take off air'}
        </button>
      </div>

      <div className="mt-5 space-y-3.5">
        <label className="block">
          <span className={LABEL}>Title</span>
          <input className={INPUT} value={entry.title} onChange={(e) => onPatch({ title: e.target.value }, 'title')} />
        </label>
        <label className="block">
          <span className={LABEL}>Artist</span>
          <input className={INPUT} value={entry.artist} onChange={(e) => onPatch({ artist: e.target.value }, 'artist')} />
        </label>
        <div>
          <span className={LABEL}>Type</span>
          <div className="flex rounded-md border border-white/12 p-0.5">
            {(['mix', 'inter'] as BroadcastKind[]).map((k) => (
              <button
                key={k}
                onClick={() => onPatch({ kind: k })}
                className={`flex-1 h-7 rounded font-sans text-[12px] transition-colors ${
                  entry.kind === k ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'
                }`}
              >
                {k === 'mix' ? 'Mix' : 'Interlude'}
              </button>
            ))}
          </div>
        </div>
        {entry.kind === 'mix' && (
          <>
            <div>
              <span className={LABEL}>Series</span>
              <div className="flex items-center gap-2">
                {([undefined, 'red', 'green', 'yellow'] as (BroadcastSeries | undefined)[]).map((sr) => (
                  <button
                    key={sr ?? 'none'}
                    onClick={() => onPatch({ series: sr })}
                    title={sr ?? 'none'}
                    className={`w-6 h-6 rounded-full border transition-[box-shadow] ${
                      entry.series === sr ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''
                    } ${sr ? 'border-transparent' : 'border-white/25'}`}
                    style={{ background: sr ? SERIES_INK[sr] : 'transparent' }}
                  />
                ))}
              </div>
            </div>
            <label className="block">
              <span className={LABEL}>Date (MM-DD-YYYY)</span>
              <input
                className={INPUT}
                value={entry.date}
                placeholder="05-20-2026"
                onChange={(e) => onPatch({ date: e.target.value }, 'date')}
              />
            </label>
          </>
        )}
        <label className="block">
          <span className={LABEL}>Tags</span>
          <input
            className={INPUT}
            value={entry.tags.join(', ')}
            placeholder="comma, separated"
            onChange={(e) =>
              onPatch({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) }, 'tags')
            }
          />
        </label>
        <p className="font-mono text-[10px] text-white/30 break-all">{entry.file}</p>
      </div>

      <button
        onClick={onRemove}
        className="mt-5 w-full h-8 rounded-md border border-[#ff6b5b]/30 font-sans text-[12px] text-[#ff8a7d] hover:bg-[#ff6b5b]/10 active:scale-[0.97] transition-[transform,background-color] duration-150"
      >
        Remove from lineup
      </button>
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
