'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mp3Encoder } from '@breezystack/lamejs';
import type { BoardSound } from '@/app/api/admin/board/route';
import { handMix } from '@/lib/mix-handoff';
import {
  type Clip, RATE, PEAKS_PER_S, VOICE, DECK_A, DECK_B,
  len, end, total, mmss, peaksOf, audible, levelFor, autoFades, envelope, duckPoints, valueAt, schedule,
} from './mixer-core';
import { putFile, getFile, saveDraft, loadDraft, clearDraft, prune } from './mixer-draft';

const KBPS = 192;
const OVERLAP = 8;          // a new song crossfades with the last one over this many seconds
const SNAP_PX = 8;
const LANES = [
  { lane: VOICE, label: 'VOICE', top: 0, h: 22 },
  { lane: DECK_A, label: 'DECK A', top: 23, h: 38 },
  { lane: DECK_B, label: 'DECK B', top: 62, h: 38 },
];
const LABEL = 'font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/45';
const BTN =
  'h-8 rounded-md border border-white/15 px-3 font-sans text-[12px] text-white/85 hover:bg-white/[0.08] hover:text-white active:scale-[0.97] transition-[transform,background-color,color] duration-150 disabled:opacity-30 disabled:pointer-events-none';
const NUM = 'w-16 bg-transparent border-b border-white/25 font-mono text-[11px] text-white outline-none focus:border-white/70 text-right tabular-nums';

/** "Paul_spotdown.org.mp3" → "Paul". */
const clean = (file: string) =>
  file.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[\s_-]*\(?(spotdown|spotidown|spotifydown)[\w.]*\)?/gi, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || file;

/** The whole mix, rendered and encoded to an MP3 in the browser, a slice at a time so the page stays alive. */
async function render(clips: Clip[], duck: number, onProgress: (f: number) => void): Promise<Blob> {
  const off = new OfflineAudioContext(2, Math.ceil(total(clips) * RATE), RATE);
  schedule(off, clips, 0, duck);
  onProgress(0.03);
  const out = await off.startRendering();
  const l = out.getChannelData(0), r = out.getChannelData(1), enc = new Mp3Encoder(2, RATE, KBPS), parts: Uint8Array[] = [];
  const BLOCK = 1152 * 200;
  const pcm = (ch: Float32Array, a: number, b: number) => Int16Array.from(ch.subarray(a, b), (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767))));
  for (let i = 0; i < l.length; i += BLOCK) {
    parts.push(enc.encodeBuffer(pcm(l, i, i + BLOCK), pcm(r, i, i + BLOCK)));
    onProgress(0.1 + 0.9 * (i / l.length));
    await new Promise((res) => setTimeout(res));
  }
  parts.push(enc.flush());
  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
}

type Grab = 'move' | 'trimL' | 'trimR' | 'fadeIn' | 'fadeOut';

/** One piece: its waveform shaped by its volume and fades, with handles to trim and fade. */
const ClipView = memo(function ClipView({ c, pps, selected, duckKey, onGrab }: { c: Clip; pps: number; selected: boolean; duckKey: string; onGrab: (e: React.PointerEvent, id: number, g: Grab) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const w = len(c) * pps;
  const lane = LANES.find((l) => l.lane === c.lane) ?? LANES[1];

  useEffect(() => {
    const canvas = cv.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const W = Math.max(1, Math.min(4096, Math.ceil(w))), H = 120;
    canvas.width = W; canvas.height = H;
    // exactly what is heard: the fades and level, times the dip under any voice
    const env = envelope(c), duck: [number, number][] = duckKey ? JSON.parse(duckKey) : [];
    const gainAt = (t: number) => valueAt(env, t) * valueAt(duck, t);
    ctx.fillStyle = c.board ? 'rgba(140,220,140,0.85)' : 'rgba(255,255,255,0.72)';
    const span = len(c) / W;
    for (let x = 0; x < W; x++) {
      const t0 = c.inT + x * span, a = Math.floor(t0 * PEAKS_PER_S), b = Math.max(a + 1, Math.floor((t0 + span) * PEAKS_PER_S));
      let p = 0;
      for (let i = a; i < b && i < c.peaks.length; i++) p = Math.max(p, c.peaks[i]);
      const h = Math.min(1, p * gainAt(c.at + x * span)) * (H / 2 - 2);
      ctx.fillRect(x, H / 2 - h, 1, Math.max(1, h * 2));
    }
    // the volume line: fades and level at a glance
    ctx.strokeStyle = 'rgba(255,200,80,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const y = H - 3 - Math.min(1.4, gainAt(c.at + x * span)) * ((H - 6) / 1.4);
      if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }, [c, w, duckKey]);

  const fi = Math.min(c.fadeIn, len(c)) * pps, fo = Math.min(c.fadeOut, len(c)) * pps;
  return (
    <div
      onPointerDown={(e) => onGrab(e, c.id, 'move')}
      className={`absolute rounded-[3px] border overflow-hidden cursor-grab active:cursor-grabbing ${
        c.board ? 'bg-[#4a9e4a]/20' : 'bg-white/[0.06]'
      } ${selected ? 'border-white ring-1 ring-white/60 z-10' : c.board ? 'border-[#4a9e4a]/70' : 'border-white/30'}`}
      style={{ left: c.at * pps, width: Math.max(4, w), top: `calc(${lane.top}% + 3px)`, height: `calc(${lane.h}% - 6px)` }}
    >
      <canvas ref={cv} className="absolute inset-0 w-full h-full pointer-events-none" />
      <div className="absolute left-3 top-3.5 right-4 font-mono text-[10px] leading-tight text-white truncate pointer-events-none [text-shadow:0_0_3px_#000]">
        {c.name} <span className="text-white/55">{mmss(len(c))}{c.gain ? `  ${c.gain > 0 ? '+' : ''}${c.gain} dB` : ''}</span>
      </div>
      {/* trim edges */}
      <div onPointerDown={(e) => onGrab(e, c.id, 'trimL')} className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30" title="Drag to trim the start" />
      <div onPointerDown={(e) => onGrab(e, c.id, 'trimR')} className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30" title="Drag to trim the end" />
      {/* fade handles, on the top edge where each fade ends */}
      {w > 30 && <>
        <div onPointerDown={(e) => onGrab(e, c.id, 'fadeIn')} title={`Fade in ${c.fadeIn.toFixed(1)} s${c.autoIn ? ' (auto)' : ''}`}
          className="absolute top-0 w-3 h-3 -ml-1.5 bg-[#ffc850] rounded-b-sm cursor-col-resize" style={{ left: Math.max(6, fi) }} />
        <div onPointerDown={(e) => onGrab(e, c.id, 'fadeOut')} title={`Fade out ${c.fadeOut.toFixed(1)} s${c.autoOut ? ' (auto)' : ''}`}
          className="absolute top-0 w-3 h-3 -mr-1.5 bg-[#ffc850] rounded-b-sm cursor-col-resize" style={{ right: Math.max(6, fo) }} />
      </>}
    </div>
  );
});

export function Mixer({ initialBoard }: { initialBoard: BoardSound[] }) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [clips, setClipsRaw] = useState<Clip[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState(() => `mix_${new Date().toISOString().slice(0, 10)}`);
  const [duck, setDuck] = useState(8);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);   // 1 = the whole mix fits
  const [viewW, setViewW] = useState(1000);
  const [over, setOver] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [restored, setRestored] = useState(false);

  const ctx = useRef<AudioContext | null>(null);
  const live = useRef<{ srcs: AudioBufferSourceNode[]; at: number; from: number } | null>(null);
  const preview = useRef<AudioBufferSourceNode | null>(null);
  const boardBufs = useRef(new Map<string, Blob>());
  const nextId = useRef(1);
  const scroller = useRef<HTMLDivElement>(null);
  const lanesEl = useRef<HTMLDivElement>(null);
  const past = useRef<Clip[][]>([]), future = useRef<Clip[][]>([]);
  const dragging = useRef(false);
  const st = useRef({ clips, pos, duck, playing, sel });
  st.current = { clips, pos, duck, playing, sel };

  const audio = () => (ctx.current ??= new AudioContext({ sampleRate: RATE }));
  const T = Math.max(total(clips) + 15, 60);
  const fitPps = viewW / T;
  const pps = fitPps * zoom;
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  // keep the moment under the pointer still while zooming
  useLayoutEffect(() => {
    const a = anchor.current, el = scroller.current;
    if (a && el) el.scrollLeft = a.t * pps - a.x;
    anchor.current = null;
  }, [pps]);

  /** Every change goes through here: crossfades follow the overlaps. history: undoable. */
  const setClips = useCallback((next: Clip[] | ((cs: Clip[]) => Clip[]), history = true) => {
    if (history) { past.current.push(st.current.clips); if (past.current.length > 100) past.current.shift(); future.current = []; }
    setClipsRaw((cs) => autoFades(typeof next === 'function' ? next(cs) : next));
  }, []);

  // --- playback ---
  const stop = useCallback(() => {
    live.current?.srcs.forEach((s) => { try { s.stop(); } catch { /* done */ } });
    live.current = null;
    setPlaying(false);
  }, []);
  const play = useCallback((from: number) => {
    live.current?.srcs.forEach((s) => { try { s.stop(); } catch { /* done */ } });
    const c = audio();
    void c.resume();
    live.current = { srcs: schedule(c, st.current.clips, from, st.current.duck, 0.05), at: c.currentTime + 0.05, from };
    setPlaying(true);
  }, []);
  // the playhead follows; the view scrolls along with it
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const l = live.current, c = ctx.current;
      if (l && c) {
        const p = Math.max(l.from, l.from + c.currentTime - l.at);
        if (p >= total(st.current.clips)) { stop(); return; }
        setPos(p);
        const sc = scroller.current;
        if (sc) { const x = p * (viewW / Math.max(total(st.current.clips) + 15, 60)) * zoom; if (x > sc.scrollLeft + sc.clientWidth - 60 || x < sc.scrollLeft) sc.scrollLeft = x - 60; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, stop, viewW, zoom]);
  // an edit while playing is heard at once (after a drag, not during it)
  useEffect(() => { if (st.current.playing && !dragging.current) play(st.current.pos); }, [clips, duck, play]);
  useEffect(() => () => { live.current?.srcs.forEach((s) => { try { s.stop(); } catch { /* done */ } }); void ctx.current?.close(); }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // the mouse wheel zooms around the pointer; Shift + wheel, or a sideways swipe, scrolls along
  const anchor = useRef<{ t: number; x: number } | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { el.scrollLeft += e.deltaX || e.deltaY; return; }
      const x = e.clientX - el.getBoundingClientRect().left;
      anchor.current = { t: (x + el.scrollLeft) / ppsRef.current, x };
      setZoom((z) => Math.max(1, Math.min(64, z * Math.pow(1.0015, -e.deltaY))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // --- loading pieces ---
  const makeClip = useCallback(async (blob: Blob, rawName: string, board: boolean): Promise<Clip> => {
    const buf = await audio().decodeAudioData(await blob.arrayBuffer());
    const peaks = peaksOf(buf), [a, b] = audible(peaks);
    const id = nextId.current++;
    void putFile(id, blob);
    return {
      id, name: board ? rawName : clean(rawName), lane: board ? VOICE : DECK_A, board,
      at: 0, inT: board ? 0 : a, outT: board ? buf.duration : Math.min(buf.duration, b),
      fadeIn: board ? 0.05 : 0, fadeOut: board ? 0.3 : 0, autoIn: !board, autoOut: !board,
      gain: levelFor(buf), buf, peaks,
    };
  }, []);

  /** Songs: in at `at` on `lane`, or after the last song with a crossfade; each next one follows. */
  const addSongs = useCallback(async (files: File[], at?: number, lane?: number) => {
    setError('');
    const list = files.filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(f.name));
    if (!list.length) return setError('Those are not audio files.');
    const made: Clip[] = [];
    for (const [i, f] of list.entries()) {
      setBusy(`Loading ${i + 1} of ${list.length}: ${clean(f.name)}`);
      try { made.push(await makeClip(f, f.name, false)); } catch { setError(`Couldn't read ${f.name}. Try an mp3, m4a or wav.`); }
    }
    setBusy('');
    if (!made.length) return;
    setClips((cs) => {
      const out = [...cs];
      let last = [...out].filter((c) => !c.board).sort((a, b) => end(a) - end(b)).pop();
      made.forEach((c, i) => {
        if (i === 0 && at !== undefined) { c.at = Math.max(0, at); c.lane = lane ?? DECK_A; }
        else { c.at = last ? Math.max(0, end(last) - OVERLAP) : 0; c.lane = last?.lane === DECK_A ? DECK_B : DECK_A; }
        out.push(c);
        last = c;
      });
      return out;
    });
    setSel(made[made.length - 1].id);
  }, [makeClip, setClips]);

  const boardBlob = useCallback(async (s: BoardSound) => {
    const hit = boardBufs.current.get(s.file);
    if (hit) return hit;
    const res = await fetch(`/api/audio/stream?file=${encodeURIComponent(s.file)}`);
    if (!res.ok) throw new Error('load');
    const b = await res.blob();
    boardBufs.current.set(s.file, b);
    return b;
  }, []);

  const addBoard = useCallback(async (s: BoardSound, at = st.current.pos) => {
    setBusy(`Loading ${s.name}…`);
    try {
      const c = await makeClip(await boardBlob(s), s.name, true);
      c.at = Math.max(0, at);
      setClips((cs) => [...cs, c]);
      setSel(c.id);
    } catch { setError(`Couldn't load ${s.name}.`); }
    setBusy('');
  }, [boardBlob, makeClip, setClips]);

  const previewBoard = async (s: BoardSound) => {
    try { preview.current?.stop(); } catch { /* done */ }
    const c = audio();
    void c.resume();
    const src = c.createBufferSource();
    src.buffer = await c.decodeAudioData(await (await boardBlob(s)).arrayBuffer());
    src.connect(c.destination);
    src.start();
    preview.current = src;
  };

  // --- the saved draft ---
  useEffect(() => {
    (async () => {
      const d = await loadDraft();
      if (d?.clips.length) {
        setBusy('Bringing back your mix…');
        const back: Clip[] = [];
        for (const s of d.clips) {
          const blob = await getFile(s.id);
          if (!blob) continue;
          try { const buf = await audio().decodeAudioData(await blob.arrayBuffer()); back.push({ ...s, buf, peaks: peaksOf(buf) }); } catch { /* skip */ }
        }
        nextId.current = Math.max(0, ...d.clips.map((c) => c.id)) + 1;
        setClipsRaw(autoFades(back));
        setName(d.name);
        setDuck(d.duck);
        setBusy('');
      }
      setRestored(true);
    })();
  }, []);
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      void saveDraft({ name, duck, clips: clips.map(({ buf: _b, peaks: _p, ...rest }) => rest) }); // eslint-disable-line @typescript-eslint/no-unused-vars
      void prune(new Set(clips.map((c) => c.id)));
    }, 600);
    return () => clearTimeout(t);
  }, [clips, name, duck, restored]);

  // --- editing ---
  const patch = useCallback((id: number, p: Partial<Clip>, history = true) => setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)), history), [setClips]);
  /** A copy of a piece (its file too) at `at`. */
  const clipboard = useRef<Clip | null>(null);
  const pasteAt = useCallback((src: Clip, at: number) => {
    const id = nextId.current++;
    void getFile(src.id).then((b) => b && putFile(id, b));
    const c = { ...src, id, at: Math.max(0, at), autoIn: src.board ? src.autoIn : true, autoOut: src.board ? src.autoOut : true };
    setClips((cs) => [...cs, c]);
    setSel(id);
  }, [setClips]);
  const duplicate = useCallback((id: number) => {
    const c = st.current.clips.find((x) => x.id === id);
    if (c) pasteAt(c, end(c));
  }, [pasteAt]);
  const remove = useCallback((id: number) => { setClips((cs) => cs.filter((c) => c.id !== id)); setSel(null); }, [setClips]);
  const split = useCallback((id: number) => {
    const c = st.current.clips.find((x) => x.id === id), p = st.current.pos;
    if (!c || p <= c.at + 0.2 || p >= end(c) - 0.2) return setError('Put the playhead inside the piece to split it.');
    const cut = c.inT + (p - c.at), id2 = nextId.current++;
    void getFile(c.id).then((b) => b && putFile(id2, b));
    setClips((cs) => cs.flatMap((x) => (x.id === id ? [{ ...x, outT: cut, fadeOut: 0, autoOut: false }, { ...x, id: id2, at: p, inT: cut, fadeIn: 0, autoIn: false }] : [x])));
  }, [setClips]);
  const undo = useCallback((redo = false) => {
    const from = redo ? future.current : past.current, to = redo ? past.current : future.current;
    const prev = from.pop();
    if (!prev) return;
    to.push(st.current.clips);
    setClipsRaw(prev);
  }, []);

  /** Dragging a piece: move it (it snaps to other edges and the playhead), trim either end, or set a fade. */
  const onGrab = useCallback((e: React.PointerEvent, id: number, g: Grab) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const c0 = st.current.clips.find((c) => c.id === id);
    if (!c0) return;
    setSel(id);
    past.current.push(st.current.clips); future.current = [];
    dragging.current = true;
    const x0 = e.clientX, k = 1 / pps, start = st.current.clips;
    // snap only to what stays put: the start, the playhead, and pieces that begin before this one
    const snaps = [0, st.current.pos, ...start.filter((c) => c.id !== id && (c.at <= c0.at || e.altKey || c0.board)).flatMap((c) => [c.at, end(c)])];
    const snap = (t: number) => { let best = t, d = SNAP_PX * k; for (const s of snaps) if (Math.abs(s - t) < d) { d = Math.abs(s - t); best = s; } return best; };
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) * k, l0 = len(c0);
      let p: Partial<Clip> = {};
      if (g === 'move') {
        let at = Math.max(0, c0.at + dt);
        const sa = snap(at), se = snap(at + l0) - l0;
        at = Math.abs(sa - at) <= Math.abs(se - at) ? sa : se;
        p = { at: Math.max(0, at) };
        const r = lanesEl.current?.getBoundingClientRect();
        if (r && !c0.board) p.lane = (ev.clientY - r.top) / r.height < 0.62 ? DECK_A : DECK_B;
      } else if (g === 'trimL') {
        const d = Math.max(-c0.inT, Math.min(l0 - 0.2, snap(c0.at + dt) - c0.at));
        p = { inT: c0.inT + d, at: c0.at + d };
      } else if (g === 'trimR') {
        p = { outT: Math.max(c0.inT + 0.2, Math.min(c0.buf.duration, c0.inT + snap(end(c0) + dt) - c0.at)) };
      } else if (g === 'fadeIn') {
        p = { fadeIn: Math.round(Math.max(0, Math.min(l0, c0.fadeIn + dt)) * 10) / 10, autoIn: false };
      } else {
        p = { fadeOut: Math.round(Math.max(0, Math.min(l0, c0.fadeOut - dt)) * 10) / 10, autoOut: false };
      }
      // ripple: moving a song, or changing where it ends, carries everything after it along (hold Alt to move it alone)
      const shift = ev.altKey || c0.board ? 0 : g === 'move' ? (p.at ?? c0.at) - c0.at : g === 'trimR' ? (p.outT ?? c0.outT) - c0.outT : 0;
      setClipsRaw(autoFades(start.map((c) => (c.id === id ? { ...c, ...p } : shift && c.at > c0.at + 0.01 ? { ...c, at: Math.max(0, c.at + shift) } : c))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      dragging.current = false;
      if (st.current.playing) play(st.current.pos);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [pps, play]);

  const seek = (clientX: number) => {
    const sc = scroller.current;
    if (!sc) return;
    const p = Math.max(0, (clientX - sc.getBoundingClientRect().left + sc.scrollLeft) / pps);
    setPos(p);
    if (playing) play(p);
  };

  // --- keys ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select')) return;
      const { sel: s, pos: p, playing: on } = st.current;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') { e.preventDefault(); if (on) stop(); else if (st.current.clips.length) play(p >= total(st.current.clips) ? 0 : p); }
      else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); undo(true); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && s !== null) { e.preventDefault(); remove(s); }
      else if (e.key.toLowerCase() === 's' && !mod && s !== null) split(s);
      else if (mod && e.key.toLowerCase() === 'c' && s !== null) { clipboard.current = st.current.clips.find((x) => x.id === s) ?? null; }
      else if (mod && e.key.toLowerCase() === 'x' && s !== null) { clipboard.current = st.current.clips.find((x) => x.id === s) ?? null; remove(s); }
      else if (mod && e.key.toLowerCase() === 'v' && clipboard.current) { e.preventDefault(); pasteAt(clipboard.current, p); }
      else if (mod && e.key.toLowerCase() === 'd' && s !== null) { e.preventDefault(); duplicate(s); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1);
        const c = st.current.clips.find((x) => x.id === s);
        if (c) patch(c.id, { at: Math.max(0, Math.round((c.at + d) * 10) / 10) });
        else { const np = Math.max(0, p + d * 10); setPos(np); if (on) play(np); }
      }
      else if (e.key === '=' || e.key === '+') setZoom((z) => Math.min(64, z * 1.5));
      else if (e.key === '-') setZoom((z) => Math.max(1, z / 1.5));
      else if (e.key === '0') setZoom(1);
      else if (e.key === 'Home') { setPos(0); if (on) play(0); }
      else if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play, stop, undo, remove, split, patch, pasteAt, duplicate]);

  // --- the sound board ---
  async function saveBoard(next: BoardSound[]) {
    const res = await fetch('/api/admin/board', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sounds: next }) });
    if (!res.ok) return setError('Could not save the sound board.');
    setBoard(next);
  }
  async function uploadBoard(files: File[]) {
    setError('');
    const next = [...board];
    for (const f of files) {
      if (!/\.mp3$/i.test(f.name)) { setError('The sound board takes .mp3 files.'); continue; }
      setBusy(`Uploading ${f.name}…`);
      try {
        const p = await fetch('/api/admin/broadcast/presign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: `board_${f.name}` }) }).then((r) => r.json());
        if (!p.ok) throw new Error();
        const put = await fetch(p.url, { method: 'PUT', headers: { 'content-type': 'audio/mpeg' }, body: f });
        if (!put.ok) throw new Error();
        boardBufs.current.set(p.key, f);
        next.push({ file: p.key, name: clean(f.name) });
      } catch { setError(`Upload of ${f.name} failed.`); }
    }
    await saveBoard(next);
    setBusy('');
  }

  // --- finish ---
  async function finish() {
    stop();
    setError('');
    setProgress(0);
    try {
      const blob = await render(clips, duck, setProgress);
      handMix(new File([blob], `${(name.trim() || 'mix').replace(/[^A-Za-z0-9._-]+/g, '_')}.mp3`, { type: 'audio/mpeg' }));
      router.push('/admin/broadcast');
    } catch {
      setError('The mix could not be made. A very long mix can run out of memory: try splitting it in two.');
      setProgress(null);
    }
  }

  async function startNew() {
    if (!confirmNew) { setConfirmNew(true); setTimeout(() => setConfirmNew(false), 3000); return; }
    stop(); setConfirmNew(false);
    await clearDraft();
    past.current = []; future.current = [];
    setClipsRaw([]); setSel(null); setPos(0); setZoom(1);
    setName(`mix_${new Date().toISOString().slice(0, 10)}`);
  }

  // drops: songs from the computer, or a sound from the board, at the point they land
  const dropAt = (e: React.DragEvent) => {
    const sc = scroller.current, ln = lanesEl.current;
    if (!sc || !ln) return {};
    const r = ln.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    return { at: Math.max(0, (e.clientX - sc.getBoundingClientRect().left + sc.scrollLeft) / pps), lane: y < 0.62 ? DECK_A : DECK_B };
  };
  const onTimelineDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setOver(false);
    const { at, lane } = dropAt(e);
    const b = e.dataTransfer.getData('application/x-vlg-board');
    if (b) { const s = board.find((x) => x.file === b); if (s) void addBoard(s, at); return; }
    if (e.dataTransfer.files.length) void addSongs([...e.dataTransfer.files], st.current.clips.length ? at : undefined, lane);
  };

  const selected = clips.find((c) => c.id === sel) ?? null;
  const width = Math.max(viewW, T * pps);
  const tick = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => s * pps >= 70) ?? 600;
  const songs = clips.filter((c) => !c.board).length;

  return (
    <div
      className="flex flex-col gap-3 h-[calc(100dvh-44px-56px)] min-h-[520px] -mx-1"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) void addSongs([...e.dataTransfer.files]); }}
    >
      {/* transport and the finish line */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Mix name"
          className="w-60 bg-transparent border-b border-white/25 pb-0.5 font-sans text-[16px] font-medium text-white outline-none focus:border-white/70" />
        <div className="flex items-center gap-1.5">
          <button className={BTN} onClick={() => { setPos(0); if (playing) play(0); }} disabled={!clips.length} title="To the start (Home)">⏮</button>
          <button className={`${BTN} w-20`} onClick={() => (playing ? stop() : play(pos >= total(clips) ? 0 : pos))} disabled={!clips.length} title="Space">{playing ? '❚❚ Pause' : '▶ Play'}</button>
        </div>
        <span className="font-mono text-[13px] text-white tabular-nums">{mmss(pos, true)}<span className="text-white/40"> / {mmss(total(clips))}</span></span>
        <span className={LABEL}>{songs} song{songs === 1 ? '' : 's'} · {clips.length - songs} board</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className={LABEL}>Zoom</span>
          <button className={`${BTN} w-8 px-0`} onClick={() => setZoom((z) => Math.max(1, z / 1.5))} title="−">−</button>
          <button className={BTN} onClick={() => setZoom(1)} title="0">Fit</button>
          <button className={`${BTN} w-8 px-0`} onClick={() => setZoom((z) => Math.min(64, z * 1.5))} title="+">+</button>
        </div>
        <button className={BTN} onClick={() => void startNew()} disabled={!clips.length}>{confirmNew ? 'Clear it all?' : 'New mix'}</button>
        <button
          className="h-8 rounded-md bg-white px-4 font-sans text-[12px] font-medium text-black hover:bg-white/85 active:scale-[0.97] transition disabled:opacity-30 disabled:pointer-events-none"
          disabled={!clips.length || progress !== null}
          onClick={() => void finish()}
        >
          {progress !== null ? `Making the mix… ${Math.round(progress * 100)}%` : 'Finish mix →'}
        </button>
      </div>

      {(error || busy) && (
        <div className="flex items-center gap-3 font-mono text-[11px]">
          {busy && <span className="text-white/70">{busy}</span>}
          {error && <span className="text-[#ff8a7a]">{error} <button className="underline text-white/60" onClick={() => setError('')}>ok</button></span>}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-[210px_1fr] gap-3">
        {/* the sound board */}
        <aside className="min-h-0 flex flex-col rounded-md border border-white/12 bg-black/10 p-3">
          <div className={`${LABEL} mb-2`}>Sound board</div>
          <ul className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 -mx-1">
            {board.map((s) => (
              <li key={s.file} draggable onDragStart={(e) => e.dataTransfer.setData('application/x-vlg-board', s.file)}
                className="group flex items-center gap-1.5 rounded px-1 py-1 font-mono text-[11px] text-white/85 hover:bg-white/[0.07] cursor-grab">
                <button onClick={() => void previewBoard(s)} className="w-5 text-white/50 hover:text-white" title="Listen">▶</button>
                <button onClick={() => void addBoard(s)} className="flex-1 min-w-0 truncate text-left" title="Add at the playhead (or drag it onto the timeline)">{s.name}</button>
                <button onClick={() => void saveBoard(board.filter((b) => b !== s))} className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white px-1" title="Remove from the board">×</button>
              </li>
            ))}
            {!board.length && <li className="px-1 font-mono text-[11px] leading-relaxed text-white/45">Upload your intros, outros and signatures once. They stay here for every mix.</li>}
          </ul>
          <label className={`${BTN} mt-2 inline-flex items-center justify-center cursor-pointer`}>
            Upload sounds
            <input type="file" accept=".mp3,audio/mpeg" multiple hidden onChange={(e) => { void uploadBoard([...(e.target.files ?? [])]); e.target.value = ''; }} />
          </label>
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-white/40">Click a sound to drop it at the playhead, or drag it to a spot. Songs dip under it.</p>
          <label className="mt-3 block">
            <span className={LABEL}>Dip songs under voice</span>
            <div className="flex items-center gap-2 mt-1">
              <input type="range" min={0} max={20} value={duck} onChange={(e) => setDuck(Number(e.target.value))} className="flex-1 accent-white" />
              <span className="w-12 text-right font-mono text-[11px] text-white/80 tabular-nums">{duck ? `−${duck} dB` : 'off'}</span>
            </div>
          </label>
        </aside>

        {/* the timeline */}
        <section className={`min-w-0 min-h-0 flex flex-col rounded-md border ${over ? 'border-white/70' : 'border-white/12'} bg-black/10`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onTimelineDrop}>
          <div ref={scroller} className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden relative select-none"
>
            <div className="relative h-full flex flex-col" style={{ width }}>
              {/* ruler */}
              <div className="h-6 shrink-0 relative border-b border-white/12 cursor-text" onPointerDown={(e) => { setSel(null); seek(e.clientX); }}>
                {Array.from({ length: Math.ceil(width / pps / tick) + 1 }, (_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-l border-white/20 pl-1 font-mono text-[9.5px] text-white/50" style={{ left: i * tick * pps }}>{mmss(i * tick)}</div>
                ))}
              </div>
              {/* lanes */}
              <div ref={lanesEl} className="relative flex-1" onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.lane) { setSel(null); seek(e.clientX); } }}>
                {LANES.map((l) => (
                  <div key={l.lane} data-lane className={`absolute left-0 right-0 border-b border-white/[0.07] ${l.lane === VOICE ? 'bg-[#4a9e4a]/[0.05]' : l.lane === DECK_B ? 'bg-white/[0.02]' : ''}`}
                    style={{ top: `${l.top}%`, height: `${l.h}%` }}>
                    <span className="sticky left-0 inline-block px-2 pt-1 font-mono text-[9px] tracking-[0.18em] text-white/30 pointer-events-none">{l.label}</span>
                  </div>
                ))}
                {clips.map((c) => <ClipView key={c.id} c={c} pps={pps} selected={c.id === sel} duckKey={c.board ? '' : JSON.stringify(duckPoints(clips, c, duck))} onGrab={onGrab} />)}
                {!clips.length && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center pointer-events-none">
                    <div className="font-sans text-[18px] text-white/85">{busy ? busy : 'Drop songs here'}</div>
                    <div className="font-mono text-[11px] leading-relaxed text-white/50 max-w-md">
                      From spotdown or your Downloads, as many as you like at once. They line up in order, crossfade over {OVERLAP} seconds,
                      lose their silent ends and come in at matching volume.
                    </div>
                    <label className={`${BTN} pointer-events-auto inline-flex items-center cursor-pointer`}>
                      Or pick files
                      <input type="file" accept="audio/*" multiple hidden onChange={(e) => { void addSongs([...(e.target.files ?? [])]); e.target.value = ''; }} />
                    </label>
                  </div>
                )}
              </div>
              {/* playhead */}
              <div className="absolute top-0 bottom-0 w-px bg-[#ff4d3d] pointer-events-none z-20" style={{ left: pos * pps }}>
                <div className="absolute -left-[5px] top-0 w-0 h-0 border-x-[5px] border-x-transparent border-t-[7px] border-t-[#ff4d3d]" />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* the selected piece, or how it all works */}
      <div className="shrink-0 min-h-[64px] rounded-md border border-white/12 bg-black/10 px-4 py-3">
        {selected ? (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <label className="flex flex-col gap-1 min-w-[160px] flex-1 max-w-xs">
              <span className={LABEL}>{selected.board ? 'Board sound' : selected.lane === DECK_A ? 'Deck A' : 'Deck B'}</span>
              <input className="bg-transparent border-b border-white/25 font-mono text-[12px] text-white outline-none focus:border-white/70" value={selected.name} onChange={(e) => patch(selected.id, { name: e.target.value }, false)} />
            </label>
            <label className="flex flex-col gap-1"><span className={LABEL}>Starts at (s)</span>
              <input className={NUM} type="number" step={0.1} min={0} value={Math.round(selected.at * 10) / 10} onChange={(e) => patch(selected.id, { at: Math.max(0, Number(e.target.value) || 0) })} /></label>
            <label className="flex flex-col gap-1"><span className={LABEL}>Cut start (s)</span>
              <input className={NUM} type="number" step={0.5} min={0} value={Math.round(selected.inT * 10) / 10} onChange={(e) => patch(selected.id, { inT: Math.max(0, Math.min(selected.outT - 0.2, Number(e.target.value) || 0)) })} /></label>
            <label className="flex flex-col gap-1"><span className={LABEL}>Cut end (s)</span>
              <input className={NUM} type="number" step={0.5} min={0} value={Math.round((selected.buf.duration - selected.outT) * 10) / 10} onChange={(e) => patch(selected.id, { outT: Math.max(selected.inT + 0.2, selected.buf.duration - Math.max(0, Number(e.target.value) || 0)) })} /></label>
            <label className="flex flex-col gap-1"><span className={LABEL}>Fade in {selected.autoIn && <span className="text-[#ffc850]">auto</span>}</span>
              <input className={NUM} type="number" step={0.5} min={0} value={Math.round(selected.fadeIn * 10) / 10} onChange={(e) => patch(selected.id, { fadeIn: Math.max(0, Number(e.target.value) || 0), autoIn: false })} /></label>
            <label className="flex flex-col gap-1"><span className={LABEL}>Fade out {selected.autoOut && <span className="text-[#ffc850]">auto</span>}</span>
              <input className={NUM} type="number" step={0.5} min={0} value={Math.round(selected.fadeOut * 10) / 10} onChange={(e) => patch(selected.id, { fadeOut: Math.max(0, Number(e.target.value) || 0), autoOut: false })} /></label>
            {!selected.board && (!selected.autoIn || !selected.autoOut) && (
              <button className={BTN} onClick={() => patch(selected.id, { autoIn: true, autoOut: true })} title="Fades follow the overlap again">Auto fades</button>
            )}
            <label className="flex flex-col gap-1 w-48"><span className={LABEL}>Volume <span className="text-white/80">{selected.gain > 0 ? '+' : ''}{selected.gain} dB</span></span>
              <input type="range" min={-24} max={12} step={1} value={selected.gain} className="accent-white"
                onPointerDown={() => { past.current.push(clips); future.current = []; }} onChange={(e) => patch(selected.id, { gain: Number(e.target.value) }, false)} /></label>
            <div className="flex gap-1.5 ml-auto">
              <button className={BTN} onClick={() => patch(selected.id, { gain: levelFor(selected.buf) })} title="Match the station's loudness">Auto level</button>
              <button className={BTN} onClick={() => split(selected.id)} title="S">Split at playhead</button>
              <button className={BTN} onClick={() => { clipboard.current = selected; }} title="Ctrl C, then Ctrl V pastes at the playhead">Copy</button>
              <button className={BTN} onClick={() => duplicate(selected.id)} title="Ctrl D">Duplicate</button>
              <button className={BTN} onClick={() => remove(selected.id)} title="Delete">Remove</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 font-mono text-[10.5px] text-white/50">
            <span><b className="text-white/80 font-normal">Space</b> play / pause</span>
            <span><b className="text-white/80 font-normal">Click the ruler</b> jump there</span>
            <span><b className="text-white/80 font-normal">Drag a piece</b> move it, later songs follow (Alt: alone)</span>
            <span><b className="text-white/80 font-normal">Drag its ends</b> trim</span>
            <span><b className="text-[#ffc850] font-normal">Yellow tabs</b> fades</span>
            <span><b className="text-white/80 font-normal">S</b> split at the playhead</span>
            <span><b className="text-white/80 font-normal">Ctrl C / V</b> copy, paste at the playhead</span>
            <span><b className="text-white/80 font-normal">Ctrl D</b> duplicate</span>
            <span><b className="text-white/80 font-normal">Del</b> remove</span>
            <span><b className="text-white/80 font-normal">⌘/Ctrl Z</b> undo</span>
            <span><b className="text-white/80 font-normal">Scroll</b> zoom (Shift + scroll: move along)</span>
            <span className="text-white/35">Your mix saves itself in this browser as you go.</span>
          </div>
        )}
      </div>
    </div>
  );
}
