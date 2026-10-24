'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import type { BroadcastEntry, BroadcastKind, BroadcastManifest, BroadcastSeries, Placement } from '@/lib/types';
import { removeEntry, addEntry, generateEntryId, validateManifest, placeAt } from '@/lib/content/arrange';
import {
  formatDuration,
  daySegments,
  toPlacements,
  secondsIntoDay,
  BROADCAST_TZ,
  type Segment,
} from '@/lib/content/broadcast';
import { Banner } from './ui';

type Props = { initial: BroadcastManifest; generation: string };
type Status = 'idle' | 'publishing' | 'published' | 'conflict' | 'error';
/** Everything the editor changes — one undo step is one Doc. */
type Doc = { entries: BroadcastEntry[]; schedule: Placement[]; filler?: string };
type Sel = { kind: 'block' | 'entry'; id: string } | null;

const SERIES_INK: Record<BroadcastSeries, string> = {
  red: '#d0644f',
  green: '#7fae6b',
  yellow: '#d9b44a',
};
const inkOf = (e: BroadcastEntry) =>
  e.kind === 'mix' ? (e.series ? SERIES_INK[e.series] : '#c8c4bb') : '#8b8b8b';

const DAY = 86_400;
const ZOOMS = [1, 2, 4, 8]; // px per minute
const NOW_RED = '#ff4d3d';
const MAGNET_PX = 8; // drops this close to another block's edge snap onto it

const INPUT =
  'w-full rounded-md bg-white/[0.04] border border-white/10 px-2.5 h-8 font-sans text-[12.5px] text-white outline-none focus:border-white/35 transition-colors placeholder:text-white/25';
const LABEL = 'block font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/40 mb-1.5';
const BTN =
  'h-8 rounded-md border border-white/12 px-3 font-sans text-[12px] text-white/80 hover:bg-white/[0.06] hover:text-white active:scale-[0.97] transition-[transform,background-color,color] duration-150 disabled:opacity-30 disabled:pointer-events-none';

/** Seconds from midnight → 'HH:MM:SS'. */
const hms = (sec: number) => {
  const s = Math.round(sec);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':');
};
/** 'H:MM' or 'H:MM:SS' (24-hour) → seconds from midnight, or null. */
const parseHms = (v: string) => {
  const m = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(v.trim());
  const t = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) : NaN;
  return t >= 0 && t < DAY ? t : null;
};
const newBlockId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Drop a series when an entry is an interlude; interludes also carry no date. */
function normalize(e: BroadcastEntry): BroadcastEntry {
  if (e.kind === 'inter') {
    const rest = { ...e, date: '' };
    delete rest.series;
    return rest;
  }
  return e;
}

type Preview = { schedule: Placement[]; id: string; dropped: number };
type Drag = {
  id: string; // block id, or the entry id when dragged from the library
  from: 'library' | 'block';
  grab: number; // seconds between the block's top and the pointer
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  over: 'day' | 'library' | null;
  preview: Preview | null;
};

export function ArrangementList({ initial, generation: initialGen }: Props) {
  // An old looping lineup opens converted into blocks; publishing switches the station over.
  const legacy = !initial.schedule;
  const start: Doc = useMemo(
    () => ({ entries: initial.entries, schedule: initial.schedule ?? toPlacements(initial), filler: initial.filler }),
    [initial],
  );
  const [doc, setDoc] = useState<Doc>(start);
  const [baseline, setBaseline] = useState<Doc | null>(legacy ? null : start);
  const [generation, setGeneration] = useState(initialGen);
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [ppm, setPpm] = useState(2);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const lastEdit = useRef<string | null>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);

  const { entries, schedule, filler } = doc;
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const lenOf = (id: string) => byId.get(id)?.durationSec ?? 0;
  const endOf = (b: Placement) => b.start + lenOf(b.entry) * b.plays;
  const manifest = (d: Doc): BroadcastManifest => ({ version: 1, entries: d.entries, schedule: d.schedule, ...(d.filler ? { filler: d.filler } : {}) });

  // What the day shows: the drag's live preview while one is over the day, else the doc.
  const shown = drag?.preview?.schedule ?? schedule;
  const segs = useMemo(
    () => daySegments({ version: 1, entries, schedule: shown, filler }),
    [entries, shown, filler],
  );
  const blockOf = useMemo(() => new Map(shown.map((b) => [b.id, b])), [shown]);
  const live = now === null ? undefined : segs.find((s) => now >= s.start && now < s.end);
  const scheduledSec = segs.reduce((a, s) => a + (s.pid ? s.end - s.start : 0), 0);
  const playsPerDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of schedule) m.set(b.entry, (m.get(b.entry) ?? 0) + b.plays);
    return m;
  }, [schedule]);

  const selBlock = sel?.kind === 'block' ? schedule.find((b) => b.id === sel.id) : undefined;
  const selEntry = sel ? byId.get(sel.kind === 'block' ? (selBlock?.entry ?? '') : sel.id) : undefined;

  const issues = useMemo(
    () =>
      validateManifest(manifest(doc)).errors.map((m) =>
        m
          .replace(/^entry (\d+)/, (_, i) => `“${entries[+i]?.title || 'untitled'}”`)
          .replace(/^block (\d+)/, (_, i) => `the ${hms(schedule[+i]?.start ?? 0)} block`),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc],
  );
  const dirty = useMemo(() => baseline === null || JSON.stringify(doc) !== JSON.stringify(baseline), [doc, baseline]);
  const knownFiles = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) if (!map.has(e.file)) map.set(e.file, e.durationSec);
    return [...map.entries()].map(([file, durationSec]) => ({ file, durationSec }));
  }, [entries]);

  const y = (sec: number) => (sec / 60) * ppm;

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
  function update(next: Doc, editKey: string | null = null) {
    if (editKey === null || editKey !== lastEdit.current) {
      setPast((p) => [...p.slice(-99), doc]);
      setFuture([]);
    }
    lastEdit.current = editKey;
    setDoc(next);
    if (status !== 'idle') setStatus('idle');
  }

  function undo() {
    if (!past.length) return;
    setFuture((f) => [doc, ...f]);
    setDoc(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    lastEdit.current = null;
    setToast(null);
  }

  function redo() {
    if (!future.length) return;
    setPast((p) => [...p, doc]);
    setDoc(future[0]);
    setFuture((f) => f.slice(1));
    lastEdit.current = null;
    setToast(null);
  }

  function patchEntry(id: string, fields: Partial<BroadcastEntry>, editKey: string | null = null) {
    update(
      { ...doc, entries: entries.map((e) => (e.id === id ? normalize({ ...e, ...fields }) : e)) },
      editKey && `${id}:${editKey}`,
    );
  }

  /** Put a block at a new start / play count, rippling and merging like a drop does. */
  function setBlock(b: Placement, editKey: string | null = null) {
    const r = placeAt(schedule, lenOf, b);
    update({ ...doc, schedule: r.schedule }, editKey && `${b.id}:${editKey}`);
    setSel({ kind: 'block', id: r.id });
    if (r.dropped) notify(`${r.dropped} block${r.dropped > 1 ? 's' : ''} pushed past midnight came off the day`);
  }

  function removeBlock(id: string) {
    const b = schedule.find((x) => x.id === id);
    update({ ...doc, schedule: schedule.filter((x) => x.id !== id) });
    if (sel?.id === id) setSel(null);
    notify(`Removed ${byId.get(b?.entry ?? '')?.title || 'untitled'} at ${hms(b?.start ?? 0)}`);
  }

  function deleteEntry(id: string) {
    const e = byId.get(id);
    update({
      entries: removeEntry(entries, id),
      schedule: schedule.filter((b) => b.entry !== id),
      filler: filler === id ? undefined : filler,
    });
    setSel(null);
    notify(`Deleted ${e?.title || 'untitled'} from the library`);
  }

  function setFiller(id: string | undefined) {
    update({ ...doc, filler: id });
    notify(id ? `Empty time now plays ${byId.get(id)?.title || 'untitled'}` : 'Empty time is now silent');
  }

  /** Scroll the page only if that time is off screen. */
  function reveal(sec: number, len: number) {
    const el = dayRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + y(sec);
    if (top < 80 || top + Math.min(y(len), 120) > window.innerHeight - 20) scrollToSec(sec, 'smooth');
  }

  function selectBlock(id: string, scroll = false) {
    setSel({ kind: 'block', id });
    const b = schedule.find((x) => x.id === id);
    if (scroll && b) reveal(b.start, endOf(b) - b.start);
  }

  // Keyboard: undo/redo, publish, ↑↓ walk the blocks, Alt+↑↓ nudge (a minute; with Shift a second), Delete, Esc.
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
          if (!selBlock) return;
          e.preventDefault();
          setBlock({ ...selBlock, start: Math.max(0, selBlock.start + dir * (e.shiftKey ? 1 : 60)) }, 'nudge');
          return;
        }
        if (!schedule.length) return;
        e.preventDefault();
        const order = [...schedule].sort((a, b) => a.start - b.start);
        const i = selBlock ? order.indexOf(selBlock) + dir : order.findIndex((b) => now !== null && endOf(b) > now);
        selectBlock(order[Math.min(Math.max(i, 0), order.length - 1)].id, true);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selBlock) {
        e.preventDefault();
        removeBlock(selBlock.id);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- Drag: pointer-driven so it works the same from library cards and timeline blocks ---------
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  /** Where a drag at (x, y) would land: snapped to the minute, magnetised to nearby block edges. */
  function previewAt(x: number, yPx: number, d: Drag): Pick<Drag, 'over' | 'preview'> {
    const lib = libraryRef.current?.getBoundingClientRect();
    if (lib && x >= lib.left && x <= lib.right && yPx >= lib.top && yPx <= lib.bottom) return { over: 'library', preview: null };
    const day = dayRef.current?.getBoundingClientRect();
    if (!day || x < day.left || x > day.right) return { over: null, preview: null };
    const block =
      d.from === 'block' ? schedule.find((b) => b.id === d.id)! : { id: 'new', entry: d.id, start: 0, plays: 1 };
    const len = lenOf(block.entry) * block.plays;
    const raw = ((yPx - day.top) / ppm) * 60 - d.grab;
    let at = Math.round(raw / 60) * 60;
    let best = (MAGNET_PX / ppm) * 60;
    for (const b of schedule) {
      if (b.id === block.id) continue;
      for (const edge of [b.start, endOf(b)]) {
        // the dragged block's top, or its bottom, against this edge
        for (const snapped of [edge, edge - len]) {
          const d = Math.abs(raw - snapped);
          if (d < best) {
            best = d;
            at = snapped;
          }
        }
      }
    }
    at = Math.min(Math.max(at, 0), DAY - 1);
    return { over: 'day', preview: placeAt(schedule, lenOf, { ...block, start: at }) };
  }

  function startDrag(e: React.PointerEvent, id: string, from: Drag['from'], grab = 0) {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection / native drag
    (document.activeElement as HTMLElement | null)?.blur?.(); // let keyboard shortcuts work right after
    setDrag({ id, from, grab, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, over: null, preview: null });
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
      setDrag({ ...d, x: e.clientX, y: e.clientY, active, ...(active ? previewAt(e.clientX, e.clientY, d) : {}) });
    };
    function up() {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (!d.active) {
        if (d.from === 'block') selectBlock(d.id);
        else setSel({ kind: 'entry', id: d.id });
      } else if (d.over === 'library' && d.from === 'block') removeBlock(d.id);
      else if (d.over === 'day' && d.preview) {
        const fresh = newBlockId();
        const rename = (id: string) => (id === 'new' ? fresh : id);
        update({ ...doc, schedule: d.preview.schedule.map((b) => ({ ...b, id: rename(b.id) })) });
        setSel({ kind: 'block', id: rename(d.preview.id) });
        if (d.preview.dropped)
          notify(`${d.preview.dropped} block${d.preview.dropped > 1 ? 's' : ''} pushed past midnight came off the day`);
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
          setDrag({ ...d, ...previewAt(d.x, d.y, d) });
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
        body: JSON.stringify({ manifest: manifest(doc), generation: gen }),
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
      setBaseline(doc);
      setStatus('published');
      notify('Published — the station is playing this day now');
    } catch {
      setErrors(['network error — nothing was published, try again']);
      setStatus('error');
    }
  }

  /** Someone published from elsewhere: fetch the live lineup and its generation. */
  async function fetchLive(): Promise<{ manifest: BroadcastManifest; generation: string } | null> {
    try {
      const res = await fetch('/api/admin/broadcast', { cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  async function loadLive() {
    const got = await fetchLive();
    if (!got) return notify('Could not reach the server');
    const m = got.manifest;
    const theirs: Doc = { entries: m.entries, schedule: m.schedule ?? toPlacements(m), filler: m.filler };
    update(theirs); // undoable: Ctrl+Z brings your version back
    setBaseline(theirs);
    setGeneration(got.generation);
    setStatus('idle');
    setSel(null);
    notify('Loaded the live day — Ctrl+Z restores yours');
  }

  async function overwriteLive() {
    const got = await fetchLive();
    if (!got) return notify('Could not reach the server');
    setGeneration(got.generation);
    publish(got.generation);
  }

  const q = query.trim().toLowerCase();
  const matches = (e: BroadcastEntry) =>
    !q || e.title.toLowerCase().includes(q) || e.file.toLowerCase().includes(q);
  const dragEntry = drag?.active
    ? byId.get(drag.from === 'block' ? (schedule.find((b) => b.id === drag.id)?.entry ?? '') : drag.id)
    : undefined;
  const placing = drag?.active && drag.preview ? blockOf.get(drag.preview.id) : undefined;
  // silences: the gaps between segments
  const gaps: [number, number][] = [];
  segs.reduce((t, s) => (s.start > t && gaps.push([t, s.start]), s.end), 0);
  if ((segs[segs.length - 1]?.end ?? 0) < DAY) gaps.push([segs[segs.length - 1]?.end ?? 0, DAY]);
  const fillerEntry = filler ? byId.get(filler) : undefined;
  const library = [...entries].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className={drag?.active ? 'cursor-grabbing' : ''}>
      {/* Toolbar */}
      <div className="sticky top-0 z-40 -mx-6 -mt-7 mb-5 px-6 h-14 flex items-center gap-4 border-b border-white/10 bg-black/85 backdrop-blur-md">
        <h1 className="font-sans text-[15px] font-medium text-white">Broadcast</h1>
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-white/50">
          <Chip>{schedule.length} blocks</Chip>
          <Chip>{formatDuration(scheduledSec)} scheduled</Chip>
          <Chip title="Time with nothing scheduled">
            {formatDuration(DAY - scheduledSec)} {fillerEntry ? `filler` : 'silence'}
          </Chip>
          <button
            onClick={() => {
              update({ ...doc, schedule: [] });
              setSel(null);
              notify('Cleared the day');
            }}
            disabled={!schedule.length}
            className={`${BTN} h-6 px-2 text-[11px]`}
            title="Take every block off the day (undoable)"
          >
            Clear day
          </button>
        </div>

        {now !== null && (
          <button
            onClick={() => scrollToSec(now, 'smooth')}
            className="ml-2 flex items-center gap-2 min-w-0 rounded-full border border-white/10 pl-2.5 pr-3 h-7 hover:bg-white/[0.05] transition-colors"
            title="Jump to now"
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: NOW_RED }} />
            <span className="font-sans text-[12px] text-white/85 truncate max-w-[220px]">
              {live ? `${entries[live.idx]?.title || 'untitled'}${live.filler ? ' (filler)' : ''}` : 'silence'}
            </span>
            {live && (
              <span className="font-mono text-[10.5px] text-white/40 tabular-nums">
                {formatDuration(live.end - now)} left
              </span>
            )}
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

      {legacy && baseline === null && (
        <Banner tone="warn">
          The old looping lineup has been laid out as blocks. Nothing changes on air until you publish.
        </Banner>
      )}
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
            drag?.over === 'library' && drag.from === 'block' ? 'border-white/40 bg-white/[0.04]' : 'border-white/10'
          }`}
        >
          <div className="mb-4">
            <span className={LABEL}>Empty time plays</span>
            <select
              className={`${INPUT} [color-scheme:dark]`}
              value={filler ?? ''}
              onChange={(e) => setFiller(e.target.value || undefined)}
              title="What airs wherever nothing is scheduled"
            >
              <option value="">Silence</option>
              {library.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title || 'untitled'} · {formatDuration(e.durationSec)} (loops)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="font-sans text-[13px] font-medium text-white/90">Library</span>
            <button onClick={() => setAdding(true)} className={`${BTN} h-7 px-2.5`}>
              + Add
            </button>
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className={`${INPUT} mb-4`} />
          {drag?.active && drag.from === 'block' && (
            <p className="mb-3 rounded-md border border-dashed border-white/25 px-2.5 py-2 font-sans text-[11.5px] text-white/60">
              Drop here to take this block off the day
            </p>
          )}
          {library.filter(matches).map((e) => (
            <div
              key={e.id}
              onPointerDown={(ev) => startDrag(ev, e.id, 'library')}
              title="Drag onto the day to schedule it"
              className={`flex items-center gap-2.5 rounded-md px-2 h-8 cursor-grab select-none transition-colors ${
                selEntry?.id === e.id ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
              } ${drag?.active && drag.from === 'library' && drag.id === e.id ? 'opacity-30' : ''}`}
            >
              <span className="w-2 h-2 shrink-0 rounded-full" style={{ background: inkOf(e) }} />
              <span className="font-sans text-[12.5px] truncate text-white/85">{e.title || 'untitled'}</span>
              {playsPerDay.get(e.id) ? (
                <span className="font-mono text-[9.5px] text-white/35 tabular-nums">×{playsPerDay.get(e.id)}</span>
              ) : null}
              <span className="ml-auto font-mono text-[10px] text-white/30 tabular-nums">{formatDuration(e.durationSec)}</span>
            </div>
          ))}
          {entries.length === 0 && <p className="px-1 font-sans text-[11.5px] text-white/25">Nothing yet — add audio.</p>}
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

            {/* empty time: silence */}
            {gaps.map(([a, b]) =>
              y(b - a) >= 18 ? (
                <div
                  key={`g${a}`}
                  className="absolute left-14 right-0 flex items-start justify-center pointer-events-none"
                  style={{ top: y(a), height: y(b - a) }}
                >
                  <span className="mt-1 font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/20">
                    silence · {formatDuration(b - a)}
                  </span>
                </div>
              ) : null,
            )}

            {segs.map((s) =>
              s.pid ? (
                <Block
                  key={s.pid}
                  seg={s}
                  block={blockOf.get(s.pid)!}
                  entry={entries[s.idx]}
                  top={y(s.start)}
                  height={y(s.end - s.start)}
                  playPx={y(s.loop)}
                  selected={sel?.kind === 'block' && sel.id === s.pid}
                  sibling={sel?.kind === 'entry' && sel.id === entries[s.idx].id}
                  live={s === live}
                  placing={blockOf.get(s.pid) === placing}
                  ghosted={drag?.active === true && drag.from === 'block' && drag.id === s.pid && drag.over !== 'day'}
                  onPointerDown={(e) => startDrag(e, s.pid!, 'block', ((e.clientY - e.currentTarget.getBoundingClientRect().top) / ppm) * 60)}
                />
              ) : (
                <div
                  key={`f${s.start}`}
                  className="absolute left-14 right-0 pointer-events-none overflow-hidden rounded-[3px]"
                  style={{
                    top: y(s.start),
                    height: Math.max(y(s.end - s.start), 1),
                    background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 6px, transparent 6px 12px)',
                  }}
                  title={`filler: ${entries[s.idx]?.title}`}
                >
                  {y(s.end - s.start) >= 18 && (
                    <span className="block px-3 pt-1 font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/25">
                      filler · {entries[s.idx]?.title || 'untitled'}
                    </span>
                  )}
                </div>
              ),
            )}

            {placing && (
              <span
                className="absolute right-2 z-30 -translate-y-full rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-black pointer-events-none"
                style={{ top: y(placing.start) - 2 }}
              >
                {hms(placing.start)} – {hms(Math.min(endOf(placing), DAY))}
                {placing.plays > 1 ? ` · ×${placing.plays}` : ''}
                {drag?.preview?.dropped ? ` · ${drag.preview.dropped} fall off at midnight` : ''}
              </span>
            )}

            {now !== null && (
              <div className="absolute left-12 right-0 z-20 h-px pointer-events-none" style={{ top: y(now), background: NOW_RED }}>
                <span
                  className="absolute -left-12 -translate-y-1/2 rounded px-1 font-mono text-[10px] leading-[15px] text-white tabular-nums"
                  style={{ background: NOW_RED }}
                >
                  {hms(now).slice(0, 5)}
                </span>
              </div>
            )}
          </div>
          <p className="mt-3 ml-14 font-mono text-[10px] text-white/30">
            day starts 00:00 · {BROADCAST_TZ.replace('_', ' ')} · drops snap to the minute and to neighbouring blocks
          </p>
        </div>

        {/* Inspector */}
        <div className="sticky top-[72px] max-h-[calc(100vh-150px)] overflow-y-auto">
          {selEntry ? (
            <Inspector
              entry={selEntry}
              block={selBlock}
              blockEnd={selBlock ? Math.min(endOf(selBlock), DAY) : 0}
              blocks={[...schedule].filter((b) => b.entry === selEntry.id).sort((a, b) => a.start - b.start)}
              isFiller={filler === selEntry.id}
              now={now}
              problems={validateManifest({ version: 1, entries: [selEntry] }).errors.map((m) => m.replace(/^entry 0: /, ''))}
              onPatch={(f, key) => patchEntry(selEntry.id, f, key)}
              onBlock={(b, key) => setBlock(b, key)}
              onSelectBlock={(id) => selectBlock(id, true)}
              onRemoveBlock={() => selBlock && removeBlock(selBlock.id)}
              onDelete={() => deleteEntry(selEntry.id)}
              onClose={() => setSel(null)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-white/12 p-5 font-sans text-[12.5px] leading-relaxed text-white/45">
              <p className="text-white/70 mb-2">Nothing selected</p>
              <p>Drag anything from the library onto the day, at any time. Drop a copy against the same mix to repeat it — the block grows.</p>
              <p className="mt-2">Drag a block back to the library to take it off the day. Anything unscheduled plays the empty-time choice above the library.</p>
              <div className="mt-4 space-y-1 font-mono text-[10.5px] text-white/35">
                <p><Kbd>↑ ↓</Kbd> walk the blocks</p>
                <p><Kbd>Alt ↑↓</Kbd> nudge a minute · <Kbd>Alt ⇧ ↑↓</Kbd> a second</p>
                <p><Kbd>Del</Kbd> remove block · <Kbd>Esc</Kbd> deselect</p>
                <p><Kbd>Ctrl Z</Kbd> undo · <Kbd>Ctrl ⇧ Z</Kbd> redo</p>
                <p><Kbd>Ctrl S</Kbd> publish</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drag ghost */}
      {dragEntry && drag && drag.over !== 'day' && (
        <div
          className="fixed z-50 pointer-events-none flex items-center gap-2 rounded-md border border-white/15 bg-[#161616]/95 px-3 h-8 shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
          style={{ left: drag.x + 14, top: drag.y + 10 }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: inkOf(dragEntry) }} />
          <span className="font-sans text-[12px] text-white/90 max-w-[220px] truncate">{dragEntry.title || 'untitled'}</span>
          <span className="font-mono text-[10px] text-white/40">{formatDuration(dragEntry.durationSec)}</span>
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
                update({ ...doc, entries: addEntry(entries, entry) });
                setAdding(false);
                setSel({ kind: 'entry', id: entry.id });
                notify(`Added ${entry.title || 'untitled'} to the library — drag it onto the day`);
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

function Block({
  seg: s,
  block: b,
  entry: e,
  top,
  height: h,
  playPx,
  selected,
  sibling,
  live,
  placing,
  ghosted,
  onPointerDown,
}: {
  seg: Segment;
  block: Placement;
  entry: BroadcastEntry;
  top: number;
  height: number;
  playPx: number;
  selected: boolean;
  sibling: boolean;
  live: boolean;
  placing: boolean;
  ghosted: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const ink = inkOf(e);
  const cut = s.end - s.start < s.loop * b.plays - 0.5;
  return (
    <div
      data-block
      onPointerDown={onPointerDown}
      title={`${e.title || 'untitled'} · ${hms(s.start)}–${hms(s.end)} · ${formatDuration(e.durationSec)}${b.plays > 1 ? ` ×${b.plays}` : ''}${cut ? ' · cut at midnight' : ''}`}
      className={`absolute left-14 right-0 cursor-grab select-none overflow-hidden transition-[filter,opacity] duration-150 hover:brightness-125 ${
        h >= 8 ? 'rounded-[6px]' : 'rounded-[2px]'
      }`}
      style={{
        top: top + 1,
        height: Math.max(h - 2, 2),
        background: `color-mix(in oklab, ${ink} ${selected || placing ? 40 : sibling ? 30 : 22}%, #0c0c0c)`,
        boxShadow: `inset 3px 0 0 ${ink}${
          selected || placing ? ', 0 0 0 2px #fff' : sibling ? ', inset 0 0 0 1px rgba(255,255,255,0.22)' : ''
        }${live ? `, inset -3px 0 0 ${NOW_RED}` : ''}`,
        opacity: ghosted ? 0.3 : 1,
        zIndex: selected || placing ? 3 : live ? 2 : 1,
      }}
    >
      {/* one hairline per repeat */}
      {playPx >= 6 &&
        Array.from({ length: b.plays - 1 }, (_, k) => (
          <span key={k} className="absolute left-[3px] right-0 border-t border-dashed border-white/20" style={{ top: (k + 1) * playPx - 1 }} />
        ))}
      {/* thin interludes get a taller invisible grab area */}
      {h < 10 && <span className="absolute inset-x-0 -top-1.5 -bottom-1.5" />}
      {h >= 20 && (
        <div className="flex items-baseline gap-3 px-3 pt-[4px] min-w-0">
          <span className="font-sans text-[12.5px] font-medium text-white/90 truncate">
            {e.title || 'untitled'}
            {b.plays > 1 && <span className="ml-1.5 font-mono text-[10.5px] text-white/50">×{b.plays}</span>}
          </span>
          {live && (
            <span className="shrink-0 rounded px-1 font-mono text-[9px] tracking-[0.12em] text-white" style={{ background: NOW_RED }}>
              ON AIR
            </span>
          )}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-white/40 tabular-nums">
            {hms(s.start)} – {hms(s.end)}
          </span>
        </div>
      )}
      {h >= 38 && (
        <div className="px-3 font-mono text-[10px] text-white/35">
          {formatDuration(e.durationSec)}
          {b.plays > 1 ? ` × ${b.plays} = ${formatDuration(e.durationSec * b.plays)}` : ''}
          {e.kind === 'inter' ? ' · interlude' : e.series ? ` · ${e.series}` : ''}
          {cut && ' · cut at midnight'}
        </div>
      )}
    </div>
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
  block,
  blockEnd,
  blocks,
  isFiller,
  now,
  problems,
  onPatch,
  onBlock,
  onSelectBlock,
  onRemoveBlock,
  onDelete,
  onClose,
}: {
  entry: BroadcastEntry;
  block: Placement | undefined;
  blockEnd: number;
  blocks: Placement[];
  isFiller: boolean;
  now: number | null;
  problems: string[];
  onPatch: (fields: Partial<BroadcastEntry>, editKey?: string) => void;
  onBlock: (b: Placement, editKey?: string) => void;
  onSelectBlock: (id: string) => void;
  onRemoveBlock: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const plays = blocks.reduce((a, b) => a + b.plays, 0);
  const next = now === null ? undefined : blocks.find((b) => b.start > now);
  const playing = now !== null && block && now >= block.start && now < blockEnd;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-1 h-9 shrink-0 rounded-full" style={{ background: inkOf(entry) }} />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[15px] font-medium text-white truncate">{entry.title || 'untitled'}</p>
          <p className="font-mono text-[10.5px] text-white/40">
            {entry.kind === 'inter' ? 'interlude' : 'mix'} · {formatDuration(entry.durationSec)} ·{' '}
            {plays ? `${plays}× a day` : 'not scheduled'}
            {isFiller ? ' · empty-time filler' : ''}
          </p>
        </div>
        <button onClick={onClose} className="text-white/35 hover:text-white text-[18px] leading-none px-1" title="Close (Esc)">
          ×
        </button>
      </div>

      {problems.length > 0 && (
        <div className="mt-3 rounded-md border border-[#ff6b5b]/30 bg-[#ff6b5b]/[0.06] px-3 py-2 font-sans text-[11.5px] text-[#ff8a7d]">
          {problems.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {block && (
        <div className="mt-4 rounded-md border border-white/10 p-3">
          <div className="flex items-center justify-between">
            <span className={LABEL + ' mb-0'}>This block</span>
            {playing ? (
              <span className="flex items-center gap-1.5 font-sans text-[11.5px] text-white/70">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: NOW_RED }} /> on air
              </span>
            ) : now !== null && block.start > now ? (
              <span className="font-sans text-[11.5px] text-white/50">in {inTime(block.start - now)}</span>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL}>Starts</span>
              <TimeInput value={block.start} onCommit={(t) => onBlock({ ...block, start: t })} />
            </label>
            <div>
              <span className={LABEL}>Plays</span>
              <div className="flex items-center h-8 rounded-md border border-white/10">
                <button
                  className="w-8 h-full text-white/60 hover:text-white disabled:opacity-25"
                  disabled={block.plays <= 1}
                  onClick={() => onBlock({ ...block, plays: block.plays - 1 })}
                  title="One play fewer"
                >
                  −
                </button>
                <span className="flex-1 text-center font-mono text-[12px] text-white tabular-nums">×{block.plays}</span>
                <button
                  className="w-8 h-full text-white/60 hover:text-white"
                  onClick={() => onBlock({ ...block, plays: block.plays + 1 })}
                  title="Repeat it once more — later blocks shift down"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <p className="mt-2 font-mono text-[10.5px] text-white/40 tabular-nums">
            ends {hms(blockEnd)} · {formatDuration(blockEnd - block.start)} on air
          </p>
          <button onClick={onRemoveBlock} className={`${BTN} mt-3 w-full`} title="Delete">
            Take this block off the day
          </button>
        </div>
      )}

      {blocks.length > 0 && (
        <div className="mt-4">
          <span className={LABEL}>On the day · click to jump</span>
          <div className="flex flex-wrap gap-1">
            {blocks.map((b) => (
              <button
                key={b.id}
                onClick={() => onSelectBlock(b.id)}
                className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums transition-colors ${
                  b.id === block?.id ? 'bg-white text-black' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white'
                }`}
              >
                {hms(b.start).slice(0, 5)}
                {b.plays > 1 ? ` ×${b.plays}` : ''}
              </button>
            ))}
          </div>
          {!block && next && now !== null && (
            <p className="mt-2 font-sans text-[11.5px] text-white/50">Next airs at {hms(next.start).slice(0, 5)} · in {inTime(next.start - now)}</p>
          )}
        </div>
      )}

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
        onClick={onDelete}
        className="mt-5 w-full h-8 rounded-md border border-[#ff6b5b]/30 font-sans text-[12px] text-[#ff8a7d] hover:bg-[#ff6b5b]/10 active:scale-[0.97] transition-[transform,background-color] duration-150"
      >
        Delete from the library{blocks.length ? ` (and its ${blocks.length} block${blocks.length > 1 ? 's' : ''})` : ''}
      </button>
    </div>
  );
}

/** 24-hour HH:MM:SS (the native time picker follows the OS's 12-hour setting). Commits on Enter / blur. */
function TimeInput({ value, onCommit }: { value: number; onCommit: (sec: number) => void }) {
  const [text, setText] = useState(hms(value));
  const [shownFor, setShownFor] = useState(value);
  if (shownFor !== value) {
    setShownFor(value);
    setText(hms(value));
  }
  const commit = () => {
    const t = parseHms(text);
    if (t !== null && t !== value) onCommit(t);
    else setText(hms(value));
  };
  return (
    <input
      className={`${INPUT} font-mono tabular-nums`}
      value={text}
      placeholder="HH:MM:SS"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
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
          {selected ? `${formatDuration(selected.durationSec)} · goes into the library` : 'no audio yet'}
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
