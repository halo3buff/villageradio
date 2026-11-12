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
import { measureLoudness, fileReader, urlReader, trimDb, TARGET_LUFS } from '@/lib/audio/loudness';
import { Banner } from './ui';

/** aside: a small panel under the library (the log's remarks). */
type Props = { initial: BroadcastManifest; generation: string; aside?: React.ReactNode };
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
/** The day's lanes, one per colour, so the chart stays the same height however big the library gets. */
const LANES = [
  { key: 'none', name: 'Light grey', note: 'mixes', ink: '#c8c4bb' },
  { key: 'inter', name: 'Grey', note: 'interludes', ink: '#8b8b8b' },
  { key: 'green', name: 'Green', ink: SERIES_INK.green },
  { key: 'yellow', name: 'Yellow', ink: SERIES_INK.yellow },
  { key: 'red', name: 'Red', ink: SERIES_INK.red },
] as const;
const laneOf = (e: BroadcastEntry) => LANES.findIndex((l) => l.key === (e.kind === 'inter' ? 'inter' : (e.series ?? 'none')));

const DAY = 86_400;
const ZOOMS = [1, 2, 4, 8]; // px per minute; 'fit' lays the whole day across the screen
const LABEL_W = 176; // the lane names down the chart's left side
const HEAD_H = 24; // the hour ruler
const ROW_MIN = 40; // a lane's least height; the lanes share whatever room the day has
const BAR_H = 34;
const MAX_PPM = 16;
const NOW_RED = '#ff4d3d';
const MAGNET_PX = 8; // drops this close to another block's edge snap onto it

const INPUT =
  'w-full rounded-md bg-white/[0.04] border border-white/10 px-2.5 h-8 font-sans text-[12.5px] text-white outline-none focus:border-white/35 transition-colors placeholder:text-white/25';
const LABEL = 'block font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/40 mb-1.5';
// Panels over the photo background: frosted, so what's in them reads.
const PANEL = 'bg-[rgb(30_30_30/0.2)] backdrop-blur-lg';
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

/** Drop a series when an entry is an interlude (interludes also carry no date), and a sound when it's a mix. */
function normalize(e: BroadcastEntry): BroadcastEntry {
  if (e.kind === 'mix' && e.sound) {
    const rest = { ...e };
    delete rest.sound;
    return rest;
  }
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
  from: 'library' | 'block' | 'resize'; // resize: dragging a block's right edge sets its plays
  grab: number; // seconds between the block's start and the pointer
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  over: 'day' | 'library' | null;
  preview: Preview | null;
};

export function ArrangementList({ initial, generation: initialGen, aside }: Props) {
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
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [width, setWidth] = useState(1440); // the day's visible width
  const [rowH, setRowH] = useState(ROW_MIN);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const lastEdit = useRef<string | null>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const playsPerLane = LANES.map((_, i) => entries.reduce((n, e) => n + (laneOf(e) === i ? (playsPerDay.get(e.id) ?? 0) : 0), 0));

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
    const map = new Map<string, KnownFile>();
    for (const e of entries) if (!map.has(e.file)) map.set(e.file, { file: e.file, durationSec: e.durationSec, lufs: e.lufs });
    return [...map.values()];
  }, [entries]);
  // Files with no loudness yet (added before measuring existed) — measured on request.
  const unmeasured = useMemo(() => [...new Set(entries.filter((e) => e.lufs === undefined).map((e) => e.file))], [entries]);
  const [measuring, setMeasuring] = useState<string | null>(null);

  /** Download each unmeasured file back from storage and measure it. Each result lands as an
   *  ordinary unpublished change; the station uses it once you publish. */
  async function measureAll() {
    for (const [i, file] of unmeasured.entries()) {
      setMeasuring(`${i + 1}/${unmeasured.length}`);
      try {
        const lufs = await measureLoudness(await urlReader(`/api/audio/stream?file=${encodeURIComponent(file)}`));
        setDoc((d) => ({ ...d, entries: d.entries.map((e) => (e.file === file ? { ...e, lufs } : e)) }));
        setStatus('idle');
      } catch {
        notify(`Couldn't measure ${file}`);
      }
    }
    setMeasuring(null);
  }

  const ppm = zoom === 'fit' ? width / 1440 : zoom;
  const tx = (sec: number) => (sec / 60) * ppm;

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
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, (sec / 60) * px - (el.clientWidth - LABEL_W) / 3), behavior });
  }

  // A zoom keeps one moment where it was on screen: `at` px from the day's left edge.
  const anchor = useRef<{ sec: number; at: number } | null>(null);
  const ppmRef = useRef(ppm);
  ppmRef.current = ppm;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && anchor.current) el.scrollLeft = (anchor.current.sec / 60) * ppm - anchor.current.at;
    anchor.current = null;
  }, [ppm]);

  /** Change zoom, keeping the time under `at` (default: the middle of the day) in place. */
  function zoomTo(next: number | 'fit', at?: number) {
    const el = scrollRef.current;
    if (!el) return;
    const fit = (el.clientWidth - LABEL_W) / 1440;
    if (next !== 'fit' && next <= fit * 1.02) next = 'fit';
    if (next === zoom) return;
    at ??= (el.clientWidth - LABEL_W) / 2;
    anchor.current = { sec: ((el.scrollLeft + at) / ppmRef.current) * 60, at };
    setZoom(next);
  }
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;

  // From md up the page is one screen, like a DAW: the library down the left, the day and the
  // selected mix under it on the right.
  const rootRef = useRef<HTMLDivElement>(null);
  const [fill, setFill] = useState<number>();
  useLayoutEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setFill(window.innerWidth >= 768 ? Math.max(520, window.innerHeight - top - 16) : undefined);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // 'fit' follows the window; the lanes split the day's height.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fit = () => {
      setWidth(el.clientWidth - LABEL_W);
      setRowH(Math.max(ROW_MIN, (el.clientHeight - HEAD_H) / (LANES.length + 1)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // As in a DAW: Ctrl/⌘ + wheel (or a trackpad pinch) zooms round the pointer; zoomed in, the wheel
  // scrolls the day sideways.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const next = Math.min(MAX_PPM, ppmRef.current * Math.exp(-e.deltaY * 0.004));
        zoomRef.current(next, e.clientX - el.getBoundingClientRect().left - LABEL_W);
        return;
      }
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

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

  /** Scroll the day only if that time is out of view. */
  function reveal(sec: number, len: number) {
    const el = scrollRef.current;
    if (!el) return;
    const left = tx(sec) - el.scrollLeft;
    if (left < 20 || left + Math.min(tx(len), 200) > el.clientWidth - LABEL_W - 20) scrollToSec(sec, 'smooth');
  }

  function selectBlock(id: string, scroll = false) {
    setSel({ kind: 'block', id });
    const b = schedule.find((x) => x.id === id);
    if (scroll && b) reveal(b.start, endOf(b) - b.start);
  }

  // Keyboard: undo/redo, publish, ←→ (or ↑↓) walk the blocks, Alt+←→ nudge (a minute; with Shift a second), Delete, Esc.
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
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const dir = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1;
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
    if (d.from === 'resize') {
      const b = schedule.find((b) => b.id === d.id)!;
      const len = lenOf(b.entry) || 1;
      const end = ((x - (dayRef.current?.getBoundingClientRect().left ?? 0)) / ppm) * 60;
      const plays = Math.max(1, Math.min(99, Math.round((end - b.start) / len)));
      return { over: 'day', preview: placeAt(schedule, lenOf, { ...b, plays }) };
    }
    const lib = libraryRef.current?.getBoundingClientRect();
    if (lib && x >= lib.left && x <= lib.right && yPx >= lib.top && yPx <= lib.bottom) return { over: 'library', preview: null };
    const lane = scrollRef.current?.getBoundingClientRect();
    const day = dayRef.current?.getBoundingClientRect();
    if (!lane || !day || x < lane.left || x > lane.right || yPx < lane.top - 40 || yPx > lane.bottom + 40)
      return { over: null, preview: null };
    const block =
      d.from === 'block' ? schedule.find((b) => b.id === d.id)! : { id: 'new', entry: d.id, start: 0, plays: 1 };
    const len = lenOf(block.entry) * block.plays;
    const raw = ((x - day.left) / ppm) * 60 - d.grab;
    let at = Math.round(raw / 60) * 60;
    let best = (MAGNET_PX / ppm) * 60;
    for (const b of schedule) {
      if (b.id === block.id) continue;
      for (const edge of [b.start, endOf(b)]) {
        // the dragged block's start, or its end, against this edge
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
        if (d.from !== 'library') selectBlock(d.id);
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
    // Auto-scroll the day near its left/right edge while dragging over it.
    const edge = () => {
      const d = dragRef.current;
      const el = scrollRef.current;
      if (d?.active && d.over === 'day' && el) {
        const r = el.getBoundingClientRect();
        const zone = 70;
        const l = r.left + LABEL_W;
        const v = d.x < l + zone ? -(l + zone - d.x) / 4 : d.x > r.right - zone ? (d.x - r.right + zone) / 4 : 0;
        if (v) {
          el.scrollLeft += v;
          setDrag({ ...d, ...previewAt(d.x, d.y, d) });
        }
      }
      raf = requestAnimationFrame(edge);
    };
    raf = requestAnimationFrame(edge);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    const cancel = () => {
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener('pointercancel', cancel);
    document.body.style.userSelect = 'none';
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
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
    <div
      ref={rootRef}
      style={{ height: fill }}
      className={`md:flex md:flex-col md:-mb-7 ${drag?.active ? (drag.from === 'resize' ? 'cursor-ew-resize' : 'cursor-grabbing') : ''}`}
    >
      {/* Toolbar */}
      <div className="relative z-40 shrink-0 -mx-4 md:-mx-6 -mt-7 px-4 md:px-6 py-2 md:py-0 md:h-14 flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 border-b border-white/10 [background:var(--vlg-cover,rgb(0_0_0/0.85))] backdrop-blur-md">
        <h1 className="font-sans text-[15px] font-medium text-white">Broadcast</h1>
        <div className="shrink-0 flex items-center gap-1.5 font-mono text-[10.5px] text-white/50">
          <Chip>{schedule.length} blocks</Chip>
          {/* the totals give way first when the toolbar is short of room */}
          <span className="hidden min-[1380px]:contents">
            <Chip>{formatDuration(scheduledSec)} scheduled</Chip>
            <Chip title="Time with nothing scheduled">
              {formatDuration(DAY - scheduledSec)} {fillerEntry ? `filler` : 'silence'}
            </Chip>
          </span>
          <button
            onClick={() => {
              update({ ...doc, schedule: [] });
              setSel(null);
              notify('Cleared the day');
            }}
            disabled={!schedule.length}
            className={`${BTN} h-6 px-2 text-[11px] whitespace-nowrap`}
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
              <span className="shrink-0 whitespace-nowrap font-mono text-[10.5px] text-white/40 tabular-nums">
                {formatDuration(live.end - now)} left
              </span>
            )}
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-white/12 p-0.5" title="Zoom">
            {(['fit', ...ZOOMS] as (number | 'fit')[]).map((z) => (
              <button
                key={z}
                onClick={() => zoomTo(z)}
                title={z === 'fit' ? 'The whole day' : undefined}
                className={`h-6 px-2 rounded font-mono text-[10.5px] transition-colors ${
                  zoom === z ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'
                }`}
              >
                {z === 'fit' ? 'Day' : `${z}×`}
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
            className={`md:w-36 md:text-right font-mono text-[10.5px] ${issues.length && dirty ? 'text-[#ff8a7d]' : 'text-white/40'}`}
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

      <div className="shrink-0 mt-4 -mb-1 empty:hidden">
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
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:flex-1 md:min-h-0 md:grid-cols-[260px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
        <div className="min-w-0 md:min-h-0 flex flex-col gap-4">
        {/* Library */}
        <div
          ref={libraryRef}
          className={`md:flex-1 md:min-h-0 rounded-lg border p-3 transition-colors md:overflow-y-auto ${PANEL} ${
            drag?.over === 'library' && drag.from === 'block' ? 'border-white/40' : 'border-white/10'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-sans text-[13px] font-medium text-white/90">Library</span>
            <button onClick={() => setAdding(true)} className={`${BTN} h-7 px-2.5`}>
              + Add
            </button>
          </div>
          <div className="space-y-3 mb-4">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className={INPUT} />
            <div>
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
          </div>
          {(unmeasured.length > 0 || measuring) && (
            <button
              onClick={measureAll}
              disabled={!!measuring}
              className={`${BTN} mb-3 w-full h-7 text-[11.5px]`}
              title={`Measures each file's loudness so loud masters play at ${TARGET_LUFS} LUFS, like Spotify`}
            >
              {measuring ? `Measuring loudness ${measuring}…` : `Measure loudness · ${unmeasured.length} file${unmeasured.length > 1 ? 's' : ''}`}
            </button>
          )}
          {drag?.active && drag.from === 'block' && (
            <p className="mb-3 rounded-md border border-dashed border-white/25 px-2.5 py-2 font-sans text-[11.5px] text-white/60">
              Drop here to take this block off the day
            </p>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-3">
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
          </div>
          {entries.length === 0 && <p className="px-1 font-sans text-[11.5px] text-white/25">Nothing yet — add audio.</p>}
        </div>
        {aside}
        </div>

        <div className="min-w-0 md:min-h-0 flex flex-col gap-4">
          {/* The day: the hours across, one lane per colour down — it never grows taller */}
          <div className={`h-[300px] md:h-auto md:flex-1 md:min-h-0 rounded-lg border border-white/10 overflow-hidden ${PANEL}`}>
            <div ref={scrollRef} className="h-full overflow-x-auto overflow-y-hidden overscroll-x-contain">
              <div className="flex" style={{ width: LABEL_W + tx(DAY) }}>
                {/* the lanes' names, pinned to the left */}
                <div className="sticky left-0 z-30 shrink-0 border-r border-white/10 [background:var(--vlg-bg,#000)]" style={{ width: LABEL_W }}>
                  <div
                    className="flex items-center px-3 border-b border-white/10 font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/30"
                    style={{ height: HEAD_H }}
                  >
                    {BROADCAST_TZ.replace('_', ' ')}
                  </div>
                  {LANES.map((l, i) => (
                    <div
                      key={l.key}
                      className={`flex items-center gap-2 px-3 border-b border-white/[0.05] ${selEntry && laneOf(selEntry) === i ? 'bg-white/[0.07]' : ''}`}
                      style={{ height: rowH }}
                    >
                      <span className="w-1 h-4 shrink-0 rounded-full" style={{ background: l.ink }} />
                      <span className="font-sans text-[12px] text-white/85">{l.name}</span>
                      {'note' in l && <span className="font-mono text-[9.5px] text-white/35">{l.note}</span>}
                      {live && !live.filler && laneOf(entries[live.idx]) === i && (
                        <span className="w-1.5 h-1.5 shrink-0 rounded-full animate-pulse" style={{ background: NOW_RED }} title="On air" />
                      )}
                      {playsPerLane[i] ? (
                        <span className="ml-auto font-mono text-[9.5px] text-white/35 tabular-nums">×{playsPerLane[i]}</span>
                      ) : null}
                    </div>
                  ))}
                  <div className="flex flex-col justify-center px-3" style={{ height: rowH }} title="What airs wherever nothing is scheduled — set in the library">
                    <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/35">Empty time</span>
                    <span className="font-sans text-[11px] truncate text-white/40">{fillerEntry ? fillerEntry.title || 'untitled' : 'silence'}</span>
                  </div>
                </div>

                <div
                  ref={dayRef}
                  className="relative shrink-0"
                  style={{ width: tx(DAY) }}
                  // Clicking empty space on the day clears the selection.
                  onPointerDown={(e) => !(e.target as HTMLElement).closest('[data-block]') && setSel(null)}
                >
                  {/* the hour ruler */}
                  <div className="relative z-20 border-b border-white/10" style={{ height: HEAD_H }}>
                    {Array.from({ length: 24 }, (_, h) =>
                      h % (tx(3600) >= 44 ? 1 : tx(3600) >= 16 ? 3 : 6) === 0 ? (
                        <span
                          key={h}
                          className="absolute top-[5px] pl-1 border-l border-white/[0.08] font-mono text-[10px] leading-[14px] text-white/35 tabular-nums"
                          style={{ left: tx(h * 3600) }}
                        >
                          {String(h).padStart(2, '0')}:00
                        </span>
                      ) : null,
                    )}
                    {now !== null && (
                      <span
                        className="absolute top-[4px] z-10 -translate-x-1/2 rounded px-1 font-mono text-[10px] leading-[15px] text-white tabular-nums"
                        style={{ left: Math.max(tx(now), 18), background: NOW_RED }}
                      >
                        {hms(now).slice(0, 5)}
                      </span>
                    )}
                    {placing && (
                      <span
                        className="absolute top-[3px] z-20 whitespace-nowrap rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-black pointer-events-none"
                        style={{ left: Math.max(0, Math.min(tx(placing.start), tx(DAY) - 280)) }}
                      >
                        {hms(placing.start)} – {hms(Math.min(endOf(placing), DAY))}
                        {placing.plays > 1 ? ` · ×${placing.plays}` : ''}
                        {drag?.preview?.dropped ? ` · ${drag.preview.dropped} fall off at midnight` : ''}
                      </span>
                    )}
                  </div>

                  <div className="relative" style={{ height: (LANES.length + 1) * rowH }}>
                    {LANES.map((l, i) => (
                      <div
                        key={l.key}
                        className={`absolute inset-x-0 border-b border-white/[0.05] ${selEntry && laneOf(selEntry) === i ? 'bg-white/[0.03]' : ''}`}
                        style={{ top: i * rowH, height: rowH }}
                      />
                    ))}
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="absolute top-0 bottom-0 border-l border-white/[0.07]" style={{ left: tx(h * 3600) }}>
                        {ppm >= 2 && <div className="absolute top-0 bottom-0 border-l border-dashed border-white/[0.04]" style={{ left: tx(1800) }} />}
                      </div>
                    ))}

                    {/* empty time: silence */}
                    {gaps.map(([a, b]) =>
                      tx(b - a) >= 80 ? (
                        <div
                          key={`g${a}`}
                          className="absolute flex items-center justify-center pointer-events-none"
                          style={{ top: LANES.length * rowH, height: rowH, left: tx(a), width: tx(b - a) }}
                        >
                          <span className="whitespace-nowrap font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/20">
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
                          top={laneOf(entries[s.idx]) * rowH + (rowH - BAR_H) / 2}
                          left={tx(s.start)}
                          width={tx(s.end - s.start)}
                          playPx={tx(s.loop)}
                          selected={sel?.kind === 'block' && sel.id === s.pid}
                          sibling={sel?.kind === 'entry' && sel.id === entries[s.idx].id}
                          live={s === live}
                          placing={blockOf.get(s.pid) === placing}
                          ghosted={drag?.active === true && drag.from === 'block' && drag.id === s.pid && drag.over !== 'day'}
                          onPointerDown={(e) => startDrag(e, s.pid!, 'block', ((e.clientX - e.currentTarget.getBoundingClientRect().left) / ppm) * 60)}
                          onResize={(e) => {
                            e.stopPropagation();
                            startDrag(e, s.pid!, 'resize');
                          }}
                        />
                      ) : (
                        <div
                          key={`f${s.start}`}
                          className="absolute pointer-events-none overflow-hidden rounded-[3px]"
                          style={{
                            top: LANES.length * rowH + (rowH - BAR_H) / 2,
                            height: BAR_H,
                            left: tx(s.start),
                            width: Math.max(tx(s.end - s.start), 1),
                            background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 6px, transparent 6px 12px)',
                          }}
                          title={`filler: ${entries[s.idx]?.title}`}
                        >
                          {tx(s.end - s.start) >= 80 && (
                            <span className="block truncate px-2.5 leading-[34px] font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/30">
                              filler · {entries[s.idx]?.title || 'untitled'}
                            </span>
                          )}
                        </div>
                      ),
                    )}

                    {now !== null && (
                      <div className="absolute top-0 bottom-0 z-10 w-px pointer-events-none" style={{ left: tx(now), background: NOW_RED }} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* The selected mix, in the room under the day */}
          <div className="shrink-0 lg:h-[306px]">
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
              <div className={`h-full rounded-lg border border-white/10 ${PANEL} p-5 grid gap-6 lg:grid-cols-3 content-start font-sans text-[12.5px] leading-relaxed text-white/55`}>
                <div>
                  <p className="text-white/80 mb-2">Nothing selected</p>
                  <p>Click a bar on the day, or a mix in the library, to see and edit it here.</p>
                </div>
                <div>
                  <p>Drag anything from the library onto the day, at any time; it lands in its colour&rsquo;s lane. Drag a bar&rsquo;s right edge to repeat it.</p>
                  <p className="mt-2">Drag a bar back to the library to take it off the day. Anything unscheduled plays the empty-time choice in the library.</p>
                </div>
                <div className="space-y-1 font-mono text-[10.5px] text-white/45">
                  <p><Kbd>← →</Kbd> walk the blocks · <Kbd>Ctrl</Kbd> + wheel zoom</p>
                  <p><Kbd>Alt ←→</Kbd> nudge a minute · <Kbd>Alt ⇧ ←→</Kbd> a second</p>
                  <p><Kbd>Del</Kbd> remove block · <Kbd>Esc</Kbd> deselect</p>
                  <p><Kbd>Ctrl Z</Kbd> undo · <Kbd>Ctrl ⇧ Z</Kbd> redo</p>
                  <p><Kbd>Ctrl S</Kbd> publish</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drag ghost */}
      {dragEntry && drag && drag.over !== 'day' && (
        <div
          className="fixed z-50 pointer-events-none flex items-center gap-2 rounded-md border border-white/15 [background:var(--vlg-cover,rgb(22_22_22/0.95))] px-3 h-8 shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
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
          <div className="w-full max-w-xl rounded-xl border border-white/10 [background:var(--vlg-cover,#0d0d0d)] shadow-2xl">
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
          className="toast-in fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 flex items-center gap-4 rounded-lg border border-white/12 [background:var(--vlg-cover,#151515)] pl-4 pr-2 h-10 shadow-[0_10px_40px_rgba(0,0,0,0.7)]"
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
  left,
  width: w,
  playPx,
  selected,
  sibling,
  live,
  placing,
  ghosted,
  onPointerDown,
  onResize,
}: {
  seg: Segment;
  block: Placement;
  entry: BroadcastEntry;
  top: number;
  left: number;
  width: number;
  playPx: number;
  selected: boolean;
  sibling: boolean;
  live: boolean;
  placing: boolean;
  ghosted: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResize: (e: React.PointerEvent<HTMLSpanElement>) => void;
}) {
  const ink = inkOf(e);
  const cut = s.end - s.start < s.loop * b.plays - 0.5;
  return (
    <div
      data-block
      onPointerDown={onPointerDown}
      title={`${e.title || 'untitled'} · ${hms(s.start)}–${hms(s.end)} · ${formatDuration(e.durationSec)}${b.plays > 1 ? ` ×${b.plays}` : ''}${cut ? ' · cut at midnight' : ''}`}
      className={`absolute cursor-grab select-none overflow-hidden transition-[filter,opacity] duration-150 hover:brightness-125 ${
        w >= 8 ? 'rounded-[5px]' : 'rounded-[2px]'
      }`}
      style={{
        top,
        height: BAR_H,
        left: left + 1,
        width: Math.max(w - 2, 2),
        background: `color-mix(in oklab, ${ink} ${selected || placing ? 40 : sibling ? 30 : 22}%, #0c0c0c)`,
        boxShadow: `inset 3px 0 0 ${ink}${
          selected || placing ? ', 0 0 0 2px #fff' : sibling ? ', inset 0 0 0 1px rgba(255,255,255,0.22)' : ''
        }${live ? `, inset 0 -3px 0 ${NOW_RED}` : ''}`,
        opacity: ghosted ? 0.3 : 1,
        zIndex: selected || placing ? 3 : live ? 2 : 1,
      }}
    >
      {/* one hairline per repeat */}
      {playPx >= 6 &&
        Array.from({ length: b.plays - 1 }, (_, k) => (
          <span key={k} className="absolute top-0 bottom-0 border-l border-dashed border-white/20" style={{ left: (k + 1) * playPx - 1 }} />
        ))}
      {/* the right edge: drag to repeat */}
      {w >= 16 && (
        <span
          onPointerDown={onResize}
          title="Drag to repeat"
          className="absolute top-0 bottom-0 right-0 z-10 w-2 cursor-ew-resize hover:bg-white/25 transition-colors"
        />
      )}
      {/* thin interludes get a wider invisible grab area */}
      {w < 10 && <span className="absolute inset-y-0 -left-1.5 -right-1.5" />}
      {w >= 24 && (
        <div className={`h-full flex items-center gap-2 min-w-0 ${w >= 60 ? 'px-2.5' : 'px-1.5'}`}>
          <span className={`truncate font-sans font-medium text-white/90 ${w >= 60 ? 'text-[12px]' : 'text-[10.5px]'}`}>{e.title || 'untitled'}</span>
          {b.plays > 1 && <span className="shrink-0 font-mono text-[10px] text-white/50">×{b.plays}</span>}
          {w >= 190 && (
            <span className="ml-auto shrink-0 font-mono text-[10px] text-white/40 tabular-nums">
              {hms(s.start).slice(0, 5)}–{hms(s.end).slice(0, 5)}
            </span>
          )}
          {live && w >= 130 && (
            <span className={`${w >= 190 ? '' : 'ml-auto '}shrink-0 rounded px-1 font-mono text-[9px] tracking-[0.12em] text-white`} style={{ background: NOW_RED }}>
              ON AIR
            </span>
          )}
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
  const COL = 'min-w-0 space-y-3.5';
  return (
    <div className={`h-full flex flex-col rounded-lg border border-white/10 ${PANEL}`}>
      <div className="shrink-0 flex items-center gap-3 px-4 h-12 border-b border-white/10">
        <span className="w-1 h-8 shrink-0 rounded-full" style={{ background: inkOf(entry) }} />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[15px] font-medium text-white truncate">{entry.title || 'untitled'}</p>
          <p className="font-mono text-[10.5px] text-white/40 truncate">
            {entry.kind === 'inter' ? 'interlude' : 'mix'} · {formatDuration(entry.durationSec)} ·{' '}
            {plays ? `${plays}× a day` : 'not scheduled'}
            {isFiller ? ' · empty-time filler' : ''}
          </p>
        </div>
        <button
          onClick={onDelete}
          className="h-7 shrink-0 rounded-md border border-[#ff6b5b]/30 px-2.5 font-sans text-[11.5px] text-[#ff8a7d] hover:bg-[#ff6b5b]/10 active:scale-[0.97] transition-[transform,background-color] duration-150"
          title={blocks.length ? `Also removes its ${blocks.length} block${blocks.length > 1 ? 's' : ''} from the day` : undefined}
        >
          Delete from library
        </button>
        <button onClick={onClose} className="text-white/35 hover:text-white text-[18px] leading-none px-1" title="Close (Esc)">
          ×
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3">
        {problems.length > 0 && (
          <div className="mb-4 rounded-md border border-[#ff6b5b]/30 bg-[#ff6b5b]/[0.06] px-3 py-2 font-sans text-[11.5px] text-[#ff8a7d]">
            {problems.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}
        <div className="grid gap-x-6 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] lg:divide-x lg:divide-white/[0.07] [&>*:not(:first-child)]:lg:pl-6">
          {/* When */}
          <div className={COL}>
            {block ? (
              <div className="rounded-md border border-white/10 p-3">
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
            ) : (
              !blocks.length && (
                <p className="font-sans text-[12px] text-white/40">Not on the day yet — drag it from the library onto the timeline.</p>
              )
            )}
            {blocks.length > 0 && (
              <div>
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
          </div>

          {/* Details */}
          <div className="min-w-0 grid grid-cols-2 gap-x-3 gap-y-3.5 content-start">
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
            {entry.kind === 'inter' && (
              <div>
                <span className={LABEL}>Sound</span>
                <Segmented
                  value={entry.sound ?? ''}
                  options={[
                    ['static', 'Static'],
                    ['speech', 'Speaking'],
                  ]}
                  onChange={(v) => onPatch({ sound: v as 'static' | 'speech' })}
                />
              </div>
            )}
            {entry.kind === 'mix' && (
              <>
                <div>
                  <span className={LABEL}>Series</span>
                  <div className="h-8 flex items-center">
                    <SeriesPicker value={entry.series} onChange={(sr) => onPatch({ series: sr })} />
                  </div>
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
          </div>

          {/* Sound */}
          <div className={COL}>
            <Preview key={entry.id} entry={entry} onLevel={(gainDb) => onPatch({ gainDb: gainDb || undefined }, 'gain')} />
            <p className="font-mono text-[10px] text-white/30 break-all">{entry.file}</p>
          </div>
        </div>
      </div>
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
const pinRate = (a: HTMLAudioElement) => {
  if (a.defaultPlaybackRate !== 1) a.defaultPlaybackRate = 1;
  if (a.playbackRate !== 1) a.playbackRate = 1;
};
/** Hear an entry exactly as the station plays it: the same loudness trim plus the admin level,
 *  which this panel also sets. */
function Preview({ entry, onLevel }: { entry: BroadcastEntry; onLevel: (gainDb: number) => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const gain = entry.gainDb ?? 0;
  const auto = trimDb(entry.lufs); // what normalisation alone does
  const total = trimDb(entry.lufs, gain);
  // Every trim is a cut (never above 0 dB), so the element's own volume applies it exactly.
  useEffect(() => { if (ref.current) ref.current.volume = Math.min(1, 10 ** (total / 20)); }, [total]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setPlaying(false));
    else a.pause();
  };

  return (
    <div>
      <span className={LABEL}>Preview · as broadcast</span>
      <audio
        ref={ref}
        src={`/api/audio/stream?file=${encodeURIComponent(entry.file)}`}
        preload="none"
        // always 1×, as the station plays it: a media-speed extension's remembered rate is snapped back
        onLoadStart={(e) => pinRate(e.currentTarget)}
        onRateChange={(e) => pinRate(e.currentTarget)}
        onPlaying={(e) => pinRate(e.currentTarget)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          aria-label={playing ? 'Pause preview' : 'Play preview'}
          className="w-8 h-8 shrink-0 grid place-items-center rounded-md border border-white/15 text-white/80 hover:bg-white/[0.06] active:scale-[0.97] transition-[transform,background-color] duration-150"
        >
          {playing ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="3" height="8" /><rect x="6" y="1" width="3" height="8" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1l7 4-7 4z" /></svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={entry.durationSec || 1}
          step={1}
          value={t}
          onChange={(e) => {
            const v = Number(e.target.value);
            setT(v);
            if (ref.current) ref.current.currentTime = v;
          }}
          aria-label="Seek"
          className="flex-1 min-w-0 accent-white/70"
        />
        <span className="whitespace-nowrap font-mono text-[10.5px] text-white/50 tabular-nums">
          {formatDuration(Math.floor(t))} / {formatDuration(entry.durationSec)}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/40 w-11">Level</span>
        <input
          type="range"
          min={-12}
          max={0}
          step={0.5}
          value={gain}
          onChange={(e) => onLevel(Number(e.target.value))}
          aria-label="Broadcast level"
          className="flex-1 min-w-0 accent-white/70"
        />
        <span className="font-mono text-[10.5px] text-white/60 tabular-nums w-14 text-right whitespace-nowrap">{gain === 0 ? '0 dB' : `${gain.toFixed(1)} dB`}</span>
      </div>
      <p className="mt-2 font-mono text-[11px] text-white/60 tabular-nums">
        {entry.lufs === undefined
          ? 'Loudness not measured yet — use “Measure loudness” in the library'
          : `${entry.lufs} LUFS · ${auto < 0 ? `normalised ${auto.toFixed(1)} dB to ${TARGET_LUFS}` : 'plays as mastered'}`}
        {gain < 0 ? ` · ${gain.toFixed(1)} dB by hand` : ''}
        {total < 0 ? ` = ${total.toFixed(1)} dB on air` : ''}
      </p>
    </div>
  );
}

type KnownFile = { file: string; durationSec: number; lufs?: number };

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
  knownFiles: KnownFile[];
  existingIds: string[];
  onAdd: (entry: BroadcastEntry) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<AddMode>('upload');
  const [existingFile, setExistingFile] = useState(knownFiles[0]?.file ?? '');
  const [upload, setUpload] = useState<KnownFile | null>(null);
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
    // measured from the local file while it uploads — no download back needed
    const lufs = measureLoudness(fileReader(picked)).catch(() => undefined);
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
      setUpload({ file: presign.key, durationSec, lufs: await lufs });
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
        ...(selected.lufs !== undefined ? { lufs: selected.lufs } : {}),
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
                {formatDuration(upload.durationSec)}
                {upload.lufs !== undefined ? ` · ${upload.lufs} LUFS` : ''} · click to replace
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
