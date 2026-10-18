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
import { Banner } from './ui';

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

type DropTarget =
  | { kind: 'day'; id: string | null; after: boolean; at: number; loop: number }
  | { kind: 'library' };
type Drag = {
  id: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  target: DropTarget | null;
  loop?: number;
};

export function ArrangementList({ initialEntries, generation: initialGen }: Props) {
  const [entries, setEntries] = useState<BroadcastEntry[]>(initialEntries);
  const [baseline, setBaseline] = useState<BroadcastEntry[]>(initialEntries);
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  // An entry can air many times a day; `loop` pins which airing was clicked.
  const [sel, setSel] = useState<{ id: string; loop: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
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
  const selectedId = sel?.id ?? null;
  const selected = entries.find((e) => e.id === selectedId) ?? null;
  // The highlighted airing: the one clicked, or the entry's first if edits moved it.
  const selSlot = useMemo(() => {
    if (!sel) return undefined;
    const mine = slots.filter((s) => onAir[s.idx].id === sel.id);
    return mine.find((s) => s.loop === sel.loop) ?? mine[0];
  }, [sel, slots, onAir]);
  // Readable publish errors: "entry 3: …" → "“Title”: …".
  const issues = useMemo(
    () =>
      validateManifest({ version: 1, entries }).errors.map((m) =>
        m.replace(/^entry (\d+)/, (_, i) => `“${entries[+i]?.title || 'untitled'}”`),
      ),
    [entries],
  );

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
    // In-app links (sidebar, nav) don't fire beforeunload, so catch them before Next routes.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
      if (!confirm('You have unpublished broadcast changes. Leave and lose them?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', handler);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  // Clock for the now-line / now-playing countdown.
  useEffect(() => {
    const tick = () => setNow(secondsIntoDay(Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = (msg: string) => setToast({ msg, key: Date.now() });

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
    setToast(null);
  }

  function redo() {
    if (!future.length) return;
    setPast((p) => [...p, entries]);
    setEntries(future[0]);
    setFuture((f) => f.slice(1));
    lastEdit.current = null;
    setToast(null);
  }

  /** Scroll the page only if that airing is off screen. */
  function reveal(s: Slot | undefined) {
    const el = dayRef.current;
    if (!s || !el) return;
    const top = el.getBoundingClientRect().top + y(s.start);
    if (top < 80 || top + Math.min(y(s.end - s.start), 120) > window.innerHeight - 20) scrollToSec(s.start, 'smooth');
  }

  /** Select an entry. Without a loop, pick its next airing from now (or its first). */
  function select(id: string | null, loop?: number, scroll = false) {
    if (id === null) return setSel(null);
    const mine = slots.filter((s) => onAir[s.idx].id === id);
    const s =
      loop !== undefined
        ? mine.find((t) => t.loop === loop)
        : mine.find((t) => now !== null && t.end > now) ?? mine[0];
    setSel({ id, loop: s?.loop ?? 0 });
    if (scroll) reveal(s);
  }

  // Play-order position among on-air entries (Earlier/Later only make sense on air).
  const airIdx = selected && !selected.hidden ? onAir.findIndex((e) => e.id === selected.id) : -1;

  /** Move the selected entry one slot earlier/later in the day, stepping over hidden entries. */
  function step(dir: -1 | 1) {
    const i = indexOf(selectedId ?? '');
    if (i < 0 || entries[i].hidden) return;
    let j = i + dir;
    while (entries[j]?.hidden) j += dir;
    if (j < 0 || j >= entries.length) return;
    update(moveTo(entries, i, j));
  }

  function duplicate(id: string) {
    const i = indexOf(id);
    const copy = { ...entries[i], id: generateEntryId(entries[i].file, entries.map((e) => e.id)) };
    const next = entries.slice();
    next.splice(i + 1, 0, copy);
    update(next);
    setSel({ id: copy.id, loop: sel?.loop ?? 0 });
    notify(`Duplicated ${copy.title || 'untitled'}`);
  }

  function remove(id: string) {
    const e = entries.find((x) => x.id === id);
    update(removeEntry(entries, id));
    if (selectedId === id) setSel(null);
    notify(`Removed ${e?.title || 'untitled'}`);
  }

  function setOnAir(id: string, on: boolean) {
    const e = entries.find((x) => x.id === id);
    patch(id, { hidden: !on });
    notify(`${e?.title || 'untitled'} ${on ? 'is back on air' : 'taken off air'}`);
  }

  // Keyboard: undo/redo, publish, ↑↓ to walk the day, Alt+↑↓ to move, Delete, Esc.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (adding) {
        if (e.key === 'Escape') setAdding(false);
        return;
      }
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]');
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        if (dirty && status !== 'publishing') publish();
      } else if (typing) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
      } else if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        setSel(null);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const dir = e.key === 'ArrowUp' ? -1 : 1;
        if (e.altKey) {
          if (!selected) return;
          e.preventDefault();
          step(dir);
          return;
        }
        if (!slots.length) return;
        e.preventDefault();
        const k = selSlot ? slots.indexOf(selSlot) + dir : live ? slots.indexOf(live) : 0;
        const s = slots[Math.min(Math.max(k, 0), slots.length - 1)];
        select(onAir[s.idx].id, s.loop, true);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        remove(selected.id);
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
    if (!slots.length) return { kind: 'day', id: null, after: false, at: 0, loop: 0 };
    const sec = Math.min(Math.max(((yPx - day.top) / ppm) * 60, 0), DAY - 1);
    const s = slots.find((t) => sec >= t.start && sec < t.end) ?? slots[slots.length - 1];
    const after = sec > (s.start + s.end) / 2;
    const id = onAir[s.idx].id;
    if (id === draggingId) return null;
    return { kind: 'day', id, after, at: after ? s.end : s.start, loop: s.loop };
  }

  function startDrag(id: string, e: React.PointerEvent, loop?: number) {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection / native drag
    (document.activeElement as HTMLElement | null)?.blur?.(); // let keyboard shortcuts work right after
    setDrag({ id, loop, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, target: null });
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
      if (!d.active) select(d.id, d.loop, d.loop === undefined);
      else if (d.target?.kind === 'library') setOnAir(d.id, false);
      else if (d.target?.kind === 'day') {
        update(placeEntry(entries, d.id, d.target.id, d.target.after));
        setSel({ id: d.id, loop: d.target.loop });
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

  async function publish(gen = generation) {
    if (issues.length) {
      setErrors(issues);
      setStatus('error');
      return;
    }
    setErrors([]);
    setStatus('publishing');
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manifest: { version: 1, entries }, generation: gen }),
      });
      if (res.status === 409) {
        setStatus('conflict');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // The admin API 404s when the session is gone (it hides itself from strangers).
        const expired = res.status === 401 || res.status === 404;
        setErrors(
          expired
            ? ['Your login expired, so nothing was published. Log in again in another tab, then press Publish — your edits stay here.']
            : (body.details ?? [`publish failed (${body.error ?? res.status})`]),
        );
        setStatus('error');
        return;
      }
      const body = await res.json();
      setGeneration(body.generation);
      setBaseline(entries);
      setStatus('published');
      notify('Published — the station is playing this lineup now');
    } catch {
      setErrors(['network error — nothing was published, try again']);
      setStatus('error');
    }
  }

  /** Someone published from elsewhere: fetch the live lineup and its generation. */
  async function fetchLive(): Promise<{ manifest: { entries: BroadcastEntry[] }; generation: string } | null> {
    try {
      const res = await fetch('/api/admin/broadcast', { cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  async function loadLive() {
    const live = await fetchLive();
    if (!live) return notify('Could not reach the server');
    update(live.manifest.entries); // undoable: Ctrl+Z brings your version back
    setBaseline(live.manifest.entries);
    setGeneration(live.generation);
    setStatus('idle');
    setSel(null);
    notify('Loaded the live lineup — Ctrl+Z restores yours');
  }

  async function overwriteLive() {
    const live = await fetchLive();
    if (!live) return notify('Could not reach the server');
    setGeneration(live.generation);
    publish(live.generation);
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
          <span
            className={`w-36 text-right font-mono text-[10.5px] ${issues.length && dirty ? 'text-[#ff8a7d]' : 'text-white/40'}`}
            title={issues.join('\n')}
          >
            {status === 'published' && !dirty
              ? 'published ✓'
              : issues.length && dirty
                ? `${issues.length} problem${issues.length > 1 ? 's' : ''} to fix`
                : dirty
                  ? 'unpublished changes'
                  : 'no changes'}
          </span>
          <button
            onClick={() => publish()}
            title="Publish (Ctrl+S)"
            disabled={!dirty || status === 'publishing'}
            className="h-8 rounded-md bg-white px-4 font-sans text-[12.5px] font-medium text-black hover:bg-white/90 active:scale-[0.97] transition-[transform,background-color] duration-150 disabled:bg-white/10 disabled:text-white/30 disabled:pointer-events-none"
          >
            {status === 'publishing' ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      {status === 'conflict' && (
        <Banner tone="warn">
          <span className="flex flex-wrap items-center gap-3">
            Someone published a different lineup since you opened this page.
            <button onClick={loadLive} className={BTN}>Load theirs</button>
            <button onClick={overwriteLive} className={BTN}>Publish mine over it</button>
          </span>
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
          <div
            ref={dayRef}
            className="relative"
            style={{ height: y(DAY) }}
            // Clicking empty space on the day clears the selection.
            onPointerDown={(e) => !(e.target as HTMLElement).closest('[data-block]') && setSel(null)}
          >
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
                selected={s === selSlot}
                sibling={s !== selSlot && selectedId === onAir[s.idx].id}
                live={s === live}
                ghosted={drag?.active === true && drag.id === onAir[s.idx].id}
                showLoop={s.loop > 0 && s.idx === 0 && y(loopSec) >= 40}
                onPointerDown={(id, e) => startDrag(id, e, s.loop)}
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
              current={selSlot?.start}
              now={now}
              problems={validateManifest({ version: 1, entries: [selected] }).errors.map((m) => m.replace(/^entry 0: /, ''))}
              canEarlier={airIdx > 0}
              canLater={airIdx >= 0 && airIdx < onAir.length - 1}
              onPatch={(f, key) => patch(selected.id, f, key)}
              onStep={step}
              onJump={(i) => {
                const s = slots.filter((t) => onAir[t.idx].id === selected.id)[i];
                if (s) select(selected.id, s.loop, true);
              }}
              onDuplicate={() => duplicate(selected.id)}
              onToggleAir={() => setOnAir(selected.id, !!selected.hidden)}
              onRemove={() => remove(selected.id)}
              onClose={() => setSel(null)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-white/12 p-5 font-sans text-[12.5px] leading-relaxed text-white/45">
              <p className="text-white/70 mb-2">Nothing selected</p>
              <p>Click a block or a library item to edit it.</p>
              <p className="mt-2">Drag from the library onto the day to put something on air. Drag a block back to the library to take it off.</p>
              <div className="mt-4 space-y-1 font-mono text-[10.5px] text-white/35">
                <p><Kbd>↑ ↓</Kbd> walk the day · <Kbd>Alt ↑↓</Kbd> move it</p>
                <p><Kbd>Del</Kbd> remove · <Kbd>Esc</Kbd> deselect</p>
                <p><Kbd>Ctrl Z</Kbd> undo · <Kbd>Ctrl ⇧ Z</Kbd> redo</p>
                <p><Kbd>Ctrl S</Kbd> publish</p>
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
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#0d0d0d] shadow-2xl">
            <AddPanel
              knownFiles={knownFiles}
              existingIds={entries.map((e) => e.id)}
              onAdd={(entry) => {
                update(addEntry(entries, entry));
                setAdding(false);
                setSel({ id: entry.id, loop: 0 });
                notify(`Added ${entry.title || 'untitled'} to the end of the loop — drag it where you want it`);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        </div>
      )}

      {toast && (
        <div
          key={toast.key}
          className="toast-in fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 flex items-center gap-4 rounded-lg border border-white/12 bg-[#151515] pl-4 pr-2 h-10 shadow-[0_10px_40px_rgba(0,0,0,0.7)]"
        >
          <span className="font-sans text-[12.5px] text-white/85">{toast.msg}</span>
          {past.length > 0 && !toast.msg.startsWith('Published') && (
            <button
              onClick={() => {
                undo();
                setToast(null);
              }}
              className="h-7 rounded-md px-2.5 font-sans text-[12px] font-medium text-white hover:bg-white/10"
            >
              Undo
            </button>
          )}
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
  sibling,
  live,
  ghosted,
  showLoop,
  onPointerDown,
}: {
  slot: Slot;
  entry: BroadcastEntry;
  top: number;
  height: number;
  selected: boolean;
  sibling: boolean;
  live: boolean;
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
        data-block
        onPointerDown={(ev) => onPointerDown(e.id, ev)}
        title={`${e.title || 'untitled'} · ${clockTime(s.start)}–${clockTime(s.end)} · ${formatDuration(e.durationSec)}${s.loop ? ` · play ${s.loop + 1} of the day` : ''}${s.cut ? ' · cut at midnight' : ''}`}
        className={`absolute left-14 right-0 cursor-grab select-none overflow-visible transition-[filter,opacity] duration-150 hover:brightness-125 ${
          h >= 8 ? 'rounded-[6px]' : 'rounded-[2px]'
        }`}
        style={{
          top: top + 1,
          height: Math.max(h - 2, 2),
          background: `color-mix(in oklab, ${ink} ${selected ? 40 : sibling ? 30 : 22}%, #0c0c0c)`,
          boxShadow: `inset 3px 0 0 ${ink}${
            selected ? ', 0 0 0 2px #fff' : sibling ? ', inset 0 0 0 1px rgba(255,255,255,0.22)' : ''
          }${live ? `, inset -3px 0 0 ${NOW_RED}` : ''}`,
          opacity: ghosted ? 0.3 : selected || live || s.loop === 0 ? 1 : 0.55,
          zIndex: selected ? 3 : live ? 2 : 1,
        }}
      >
        {/* thin interludes get a taller invisible grab area */}
        {h < 10 && <span className="absolute inset-x-0 -top-1.5 -bottom-1.5" />}
        {h >= 20 && (
          <div className="flex items-baseline gap-3 px-3 pt-[4px] min-w-0">
            <span className="font-sans text-[12.5px] font-medium text-white/90 truncate">
              {e.title || 'untitled'}
            </span>
            {live && (
              <span className="shrink-0 rounded px-1 font-mono text-[9px] tracking-[0.12em] text-white" style={{ background: NOW_RED }}>
                ON AIR
              </span>
            )}
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

// The manifest stores 'MM-DD-YYYY'; <input type="date"> speaks 'YYYY-MM-DD'.
const toIso = (mdy: string) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(mdy);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : '';
};
const fromIso = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}-${m[3]}-${m[1]}` : '';
};
const inTime = (sec: number) => {
  const m = Math.max(1, Math.round(sec / 60));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

function Inspector({
  entry,
  airs,
  current,
  now,
  problems,
  canEarlier,
  canLater,
  onPatch,
  onStep,
  onJump,
  onDuplicate,
  onToggleAir,
  onRemove,
  onClose,
}: {
  entry: BroadcastEntry;
  airs: number[];
  current: number | undefined;
  now: number | null;
  problems: string[];
  canEarlier: boolean;
  canLater: boolean;
  onPatch: (fields: Partial<BroadcastEntry>, editKey?: string) => void;
  onStep: (dir: -1 | 1) => void;
  onJump: (i: number) => void;
  onDuplicate: () => void;
  onToggleAir: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [allTimes, setAllTimes] = useState(false);
  const shown = allTimes ? airs : airs.slice(0, 12);
  const playing = now !== null && airs.some((t) => now >= t && now < t + entry.durationSec);
  const next = now === null ? undefined : airs.find((t) => t > now);
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
        <button onClick={onClose} className="text-white/35 hover:text-white text-[18px] leading-none px-1" title="Close (Esc)">
          ×
        </button>
      </div>

      {!entry.hidden && now !== null && (playing || next !== undefined) && (
        <p className="mt-3 flex items-center gap-2 font-sans text-[12px] text-white/70">
          {playing ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: NOW_RED }} /> On air right now
            </>
          ) : (
            <>
              Next airs at {clockTime(next!)} · in {inTime(next! - now)}
            </>
          )}
        </p>
      )}

      {problems.length > 0 && (
        <div className="mt-3 rounded-md border border-[#ff6b5b]/30 bg-[#ff6b5b]/[0.06] px-3 py-2 font-sans text-[11.5px] text-[#ff8a7d]">
          {problems.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {airs.length > 0 && (
        <div className="mt-4">
          <span className={LABEL}>Airs at · click to jump</span>
          <div className="flex flex-wrap gap-1">
            {shown.map((t, i) => (
              <button
                key={i}
                onClick={() => onJump(i)}
                className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums transition-colors ${
                  t === current ? 'bg-white text-black' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white'
                }`}
              >
                {clockTime(t)}
              </button>
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
        <button onClick={() => onStep(-1)} disabled={!canEarlier} className={BTN} title="Alt+↑">
          ↑ Earlier
        </button>
        <button onClick={() => onStep(1)} disabled={!canLater} className={BTN} title="Alt+↓">
          ↓ Later
        </button>
        <button onClick={onDuplicate} className={BTN}>
          Duplicate
        </button>
        <button onClick={onToggleAir} className={BTN}>
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
          <Segmented
            value={entry.kind}
            options={[
              ['mix', 'Mix'],
              ['inter', 'Interlude'],
            ]}
            onChange={(k) => onPatch({ kind: k as BroadcastKind })}
          />
        </div>
        {entry.kind === 'mix' && (
          <>
            <div>
              <span className={LABEL}>Series</span>
              <SeriesPicker value={entry.series} onChange={(sr) => onPatch({ series: sr })} />
            </div>
            <label className="block">
              <span className={LABEL}>Date</span>
              <input
                type="date"
                className={`${INPUT} [color-scheme:dark]`}
                value={toIso(entry.date)}
                onChange={(e) => onPatch({ date: fromIso(e.target.value) }, 'date')}
              />
            </label>
          </>
        )}
        <label className="block">
          <span className={LABEL}>Tags</span>
          <TagsInput key={entry.id} value={entry.tags} onChange={(tags) => onPatch({ tags }, 'tags')} />
        </label>
        <p className="font-mono text-[10px] text-white/30 break-all">{entry.file}</p>
      </div>

      <button
        onClick={onRemove}
        className="mt-5 w-full h-8 rounded-md border border-[#ff6b5b]/30 font-sans text-[12px] text-[#ff8a7d] hover:bg-[#ff6b5b]/10 active:scale-[0.97] transition-[transform,background-color] duration-150"
        title="Delete"
      >
        Remove from lineup
      </button>
    </div>
  );
}

/** Comma-separated tags. Keeps the raw text while typing so "a, " doesn't eat the comma. */
function TagsInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const parse = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean);
  const [text, setText] = useState(value.join(', '));
  // Resync when the tags change from outside (undo/redo).
  if (parse(text).join(',') !== value.join(',')) setText(value.join(', '));
  return (
    <input
      className={INPUT}
      value={text}
      placeholder="comma, separated"
      onChange={(e) => {
        setText(e.target.value);
        onChange(parse(e.target.value));
      }}
    />
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-md border border-white/12 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 h-7 rounded font-sans text-[12px] transition-colors ${
            value === v ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SeriesPicker({
  value,
  onChange,
}: {
  value: BroadcastSeries | undefined;
  onChange: (s: BroadcastSeries | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {([undefined, 'red', 'green', 'yellow'] as (BroadcastSeries | undefined)[]).map((sr) => (
        <button
          key={sr ?? 'none'}
          type="button"
          onClick={() => onChange(sr)}
          title={sr ?? 'no series'}
          className={`w-6 h-6 rounded-full border transition-[box-shadow] ${
            value === sr ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''
          } ${sr ? 'border-transparent' : 'border-white/25'}`}
          style={{ background: sr ? SERIES_INK[sr] : 'transparent' }}
        />
      ))}
    </div>
  );
}

type AddMode = 'existing' | 'upload';

/** Read an audio file's length locally, before spending time uploading it. */
function probeDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (Number.isFinite(audio.duration) && audio.duration > 0) resolve(Math.round(audio.duration));
      else reject(new Error('no duration'));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    audio.src = url;
  });
}

/** PUT with upload progress (fetch can't report it). */
function putWithProgress(url: string, file: File, onProgress: (f: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', 'audio/mpeg');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

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
  const [mode, setMode] = useState<AddMode>('upload');
  const [existingFile, setExistingFile] = useState(knownFiles[0]?.file ?? '');
  const [upload, setUpload] = useState<{ file: string; durationSec: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('Village Radio');
  const [kind, setKind] = useState<BroadcastKind>('mix');
  const [date, setDate] = useState('');
  const [series, setSeries] = useState<BroadcastSeries | undefined>(undefined);
  const uploading = progress !== null;

  const selected = mode === 'upload' ? upload : (knownFiles.find((f) => f.file === existingFile) ?? null);

  async function uploadAudio(picked: File) {
    setUploadError('');
    setUpload(null);
    if (!/\.mp3$/i.test(picked.name)) return setUploadError('Only .mp3 files can be added.');
    let durationSec: number;
    try {
      durationSec = await probeDuration(picked);
    } catch {
      return setUploadError('Could not read that file — is it a valid mp3?');
    }
    setProgress(0);
    try {
      // Presigned R2 URL: avoids Cloud Run's 32 MB body limit.
      const presignRes = await fetch('/api/admin/broadcast/presign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: picked.name }),
      });
      const presign = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok || !presign.ok) return setUploadError(presign.error ?? 'Upload could not start.');
      if (!(await putWithProgress(presign.url, picked, setProgress)))
        return setUploadError('Upload failed — check your connection and try again.');
      setUpload({ file: presign.key, durationSec });
      if (!title) setTitle(picked.name.replace(/\.[^.]+$/, ''));
    } catch {
      setUploadError('Network error — try again.');
    } finally {
      setProgress(null);
    }
  }

  function submit() {
    if (!selected || uploading) return;
    onAdd(
      normalize({
        id: generateEntryId(selected.file, existingIds),
        title: title.trim(),
        artist: artist.trim(),
        date,
        durationSec: selected.durationSec,
        file: selected.file,
        kind,
        ...(kind === 'mix' && series ? { series } : {}),
        tags: [],
      }),
    );
  }

  return (
    <form
      className="p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-sans text-[15px] font-medium text-white">Add to the lineup</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-white/35 hover:text-white text-[18px] leading-none px-1"
          title="Close (Esc)"
        >
          ×
        </button>
      </div>

      {knownFiles.length > 0 && (
        <div className="mb-4 w-64">
          <Segmented
            value={mode}
            options={[
              ['upload', 'Upload new audio'],
              ['existing', 'Reuse a file'],
            ]}
            onChange={(m) => setMode(m as AddMode)}
          />
        </div>
      )}

      {mode === 'existing' ? (
        <label className="block mb-4">
          <span className={LABEL}>File</span>
          <select
            className={`${INPUT} [color-scheme:dark]`}
            value={existingFile}
            onChange={(e) => setExistingFile(e.target.value)}
          >
            {knownFiles.map((f) => (
              <option key={f.file} value={f.file}>
                {f.file} · {formatDuration(f.durationSec)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label
          className={`mb-4 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 px-4 py-6 text-center transition-colors ${
            uploading ? '' : 'hover:border-white/45 cursor-pointer'
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f && !uploading) uploadAudio(f);
          }}
        >
          <input
            type="file"
            accept=".mp3,audio/mpeg"
            disabled={uploading}
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && uploadAudio(e.target.files[0])}
          />
          {progress !== null ? (
            <>
              <span className="font-sans text-[12.5px] text-white/80">Uploading… {Math.round(progress * 100)}%</span>
              <span className="mt-2 h-1 w-56 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full bg-white transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
              </span>
            </>
          ) : upload ? (
            <>
              <span className="font-sans text-[12.5px] text-white/85">✓ {upload.file}</span>
              <span className="font-mono text-[10.5px] text-white/40">
                {formatDuration(upload.durationSec)} · click to replace
              </span>
            </>
          ) : (
            <>
              <span className="font-sans text-[12.5px] text-white/80">Drop an .mp3 here, or click to choose</span>
              <span className="font-mono text-[10.5px] text-white/35">uploads straight to storage</span>
            </>
          )}
          {uploadError && <span className="mt-1 font-sans text-[11.5px] text-[#ff8a7d]">{uploadError}</span>}
        </label>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        <label className="block col-span-2">
          <span className={LABEL}>Title</span>
          <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="RED 05.20.2026" />
        </label>
        <label className="block">
          <span className={LABEL}>Artist</span>
          <input className={INPUT} value={artist} onChange={(e) => setArtist(e.target.value)} />
        </label>
        <div>
          <span className={LABEL}>Type</span>
          <Segmented
            value={kind}
            options={[
              ['mix', 'Mix'],
              ['inter', 'Interlude'],
            ]}
            onChange={(k) => setKind(k as BroadcastKind)}
          />
        </div>
        {kind === 'mix' && (
          <>
            <label className="block">
              <span className={LABEL}>Date</span>
              <input
                type="date"
                className={`${INPUT} [color-scheme:dark]`}
                value={toIso(date)}
                onChange={(e) => setDate(fromIso(e.target.value))}
              />
            </label>
            <div>
              <span className={LABEL}>Series</span>
              <SeriesPicker value={series} onChange={setSeries} />
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <span className="mr-auto font-mono text-[10.5px] text-white/35">
          {selected ? `${formatDuration(selected.durationSec)} · goes on the end of the loop` : 'no audio yet'}
        </span>
        <button type="button" onClick={onCancel} className={BTN}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={!selected || uploading}
          className="h-8 rounded-md bg-white px-4 font-sans text-[12.5px] font-medium text-black hover:bg-white/90 active:scale-[0.97] transition-[transform,background-color] duration-150 disabled:bg-white/10 disabled:text-white/30 disabled:pointer-events-none"
        >
          Add
        </button>
      </div>
    </form>
  );
}
