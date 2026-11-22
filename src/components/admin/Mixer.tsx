'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mp3Encoder } from '@breezystack/lamejs';
import type { BoardSound } from '@/app/api/admin/board/route';
import { handMix } from '@/lib/mix-handoff';
import { Banner } from './ui';

const RATE = 44100, KBPS = 192;
const SONG_FADE = 8;   // a dropped song overlaps the one before by this much, s
const LABEL = 'font-mono text-[9.5px] tracking-[0.14em] uppercase text-white/40';
const BTN =
  'h-8 rounded-md border border-white/12 px-3 font-sans text-[12px] text-white/80 hover:bg-white/[0.06] hover:text-white active:scale-[0.97] transition-[transform,background-color,color] duration-150 disabled:opacity-30 disabled:pointer-events-none';
const NUM = 'w-14 bg-transparent border-b border-white/25 font-mono text-[11px] text-white outline-none focus:border-white/60 text-right';

/** One piece on the timeline. start: seconds trimmed off its head. fade: seconds it overlaps the
 *  piece before (crossfaded). gain: dB. */
interface Clip { id: number; name: string; buf: AudioBuffer; start: number; fade: number; gain: number; board: boolean }

export const len = (c: Clip) => Math.max(0.1, c.buf.duration - c.start);
/** Where each clip begins on the mix, s. */
export function layout(clips: Clip[]): number[] {
  const at: number[] = [];
  clips.forEach((c, i) => at.push(i === 0 ? 0 : Math.max(0, at[i - 1] + len(clips[i - 1]) - c.fade)));
  return at;
}
const total = (clips: Clip[]) => { const at = layout(clips); return clips.length ? Math.max(...clips.map((c, i) => at[i] + len(c))) : 0; };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Lay the clips onto a context from `from` s into the mix; the same plan plays the preview and renders the file. */
function schedule(ctx: BaseAudioContext, clips: Clip[], from: number): AudioBufferSourceNode[] {
  const at = layout(clips), t0 = ctx.currentTime - from;
  return clips.flatMap((c, i) => {
    const l = len(c), end = at[i] + l;
    if (end <= from) return [];
    const fin = i > 0 ? Math.min(c.fade, l) : 0, fout = i < clips.length - 1 ? Math.min(clips[i + 1].fade, l) : 0;
    const level = Math.pow(10, c.gain / 20);
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = c.buf;
    g.gain.setValueAtTime(fin ? 0 : level, t0 + at[i]);
    if (fin) g.gain.linearRampToValueAtTime(level, t0 + at[i] + fin);
    if (fout) { g.gain.setValueAtTime(level, t0 + end - fout); g.gain.linearRampToValueAtTime(0, t0 + end); }
    src.connect(g).connect(ctx.destination);
    const skip = Math.max(0, from - at[i]);
    src.start(Math.max(ctx.currentTime, t0 + at[i]), c.start + skip, l - skip);
    return [src];
  });
}

/** The whole mix, rendered and encoded to an MP3 in the browser, a slice at a time so the page stays alive. */
async function render(clips: Clip[], onProgress: (f: number) => void): Promise<Blob> {
  const off = new OfflineAudioContext(2, Math.ceil(total(clips) * RATE), RATE);
  schedule(off, clips, 0);
  onProgress(0.02);
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

export function Mixer({ initialBoard }: { initialBoard: BoardSound[] }) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [clips, setClips] = useState<Clip[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const ctx = useRef<AudioContext | null>(null);
  const live = useRef<{ srcs: AudioBufferSourceNode[]; at: number; from: number } | null>(null);
  const nextId = useRef(1);
  const lane = useRef<HTMLDivElement>(null);
  const audio = () => (ctx.current ??= new AudioContext({ sampleRate: RATE }));

  const stop = () => {
    live.current?.srcs.forEach((s) => { try { s.stop(); } catch { /* already done */ } });
    live.current = null;
    setPlaying(false);
  };
  const play = (from = pos) => {
    stop();
    const c = audio();
    void c.resume();
    live.current = { srcs: schedule(c, clips, from), at: c.currentTime, from };
    setPlaying(true);
  };
  // the playhead follows the preview
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const l = live.current, c = ctx.current;
      if (l && c) {
        const p = l.from + c.currentTime - l.at;
        if (p >= total(clips)) { stop(); setPos(0); return; }
        setPos(p);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, clips]);
  useEffect(() => () => { stop(); void ctx.current?.close(); }, []);

  const edit = (id: number, patch: Partial<Clip>) => { stop(); setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))); };

  async function addFiles(files: File[], board = false) {
    setError('');
    for (const f of files) {
      setBusy(`Reading ${f.name}…`);
      try {
        const buf = await audio().decodeAudioData(await f.arrayBuffer());
        stop();
        setClips((cs) => [...cs, { id: nextId.current++, name: f.name.replace(/\.[^.]+$/, ''), buf, start: 0, fade: cs.length && !board ? SONG_FADE : 0, gain: 0, board }]);
      } catch {
        setError(`Couldn't read ${f.name}. Try an mp3, m4a or wav.`);
      }
    }
    setBusy('');
  }

  async function addBoard(s: BoardSound) {
    setBusy(`Loading ${s.name}…`);
    try {
      const res = await fetch(`/api/audio/stream?file=${encodeURIComponent(s.file)}`);
      if (!res.ok) throw new Error();
      await addFiles([new File([await res.arrayBuffer()], `${s.name}.mp3`)], true);
    } catch {
      setError(`Couldn't load ${s.name}.`);
      setBusy('');
    }
  }

  async function saveBoard(next: BoardSound[]) {
    const res = await fetch('/api/admin/board', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sounds: next }) });
    if (!res.ok) return setError('Could not save the sound board.');
    setBoard(next);
  }

  async function uploadBoard(files: File[]) {
    setError('');
    const next = [...board];
    for (const f of files) {
      if (!/\.mp3$/i.test(f.name)) { setError('Sound board takes .mp3 files.'); continue; }
      setBusy(`Uploading ${f.name}…`);
      try {
        const p = await fetch('/api/admin/broadcast/presign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: `board_${f.name}` }) }).then((r) => r.json());
        if (!p.ok) throw new Error();
        const put = await fetch(p.url, { method: 'PUT', headers: { 'content-type': 'audio/mpeg' }, body: f });
        if (!put.ok) throw new Error();
        next.push({ file: p.key, name: f.name.replace(/\.[^.]+$/, '') });
      } catch {
        setError(`Upload of ${f.name} failed.`);
      }
    }
    await saveBoard(next);
    setBusy('');
  }

  async function finish() {
    stop();
    setError('');
    setProgress(0);
    try {
      const blob = await render(clips, setProgress);
      const file = new File([blob], `${(name.trim() || 'mix').replace(/[^A-Za-z0-9._-]+/g, '_')}.mp3`, { type: 'audio/mpeg' });
      handMix(file);
      router.push('/admin/broadcast');
    } catch {
      setError('The mix could not be rendered. A very long mix can run out of memory: try a shorter one.');
      setProgress(null);
    }
  }

  const at = layout(clips), T = Math.max(1, total(clips));
  // dragging a block sideways changes how far it overlaps the one before
  const drag = (e: React.PointerEvent, i: number) => {
    if (i === 0 || !lane.current) return;
    const c = clips[i], x0 = e.clientX, f0 = c.fade, pxPerS = lane.current.clientWidth / T;
    const max = Math.min(len(clips[i - 1]), len(c));
    const move = (ev: PointerEvent) => edit(c.id, { fade: Math.round(Math.max(0, Math.min(max, f0 - (ev.clientX - x0) / pxPerS)) * 10) / 10 });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const swap = (i: number, j: number) => { stop(); setClips((cs) => { const n = [...cs]; [n[i], n[j]] = [n[j], n[i]]; return n; }); };

  return (
    <div
      className="max-w-6xl mx-auto"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void addFiles([...e.dataTransfer.files]); }}
    >
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="font-sans text-[15px] font-medium text-white">Mixer</h1>
        <span className={LABEL}>{clips.length} pieces · {mmss(total(clips))}</span>
      </div>

      {error && <div className="mb-4"><Banner tone="warn">{error}</Banner></div>}

      <div className="grid md:grid-cols-[220px_1fr] gap-8">
        {/* the sound board */}
        <section>
          <div className={`${LABEL} mb-3`}>Sound board</div>
          <ul className="flex flex-col gap-1 mb-3">
            {board.map((s) => (
              <li key={s.file} className="group flex items-center gap-2 font-mono text-[11px] text-white/80">
                <button onClick={() => void addBoard(s)} className="flex-1 min-w-0 truncate text-left hover:text-white" title="Add to the end of the mix">+ {s.name}</button>
                <button onClick={() => void saveBoard(board.filter((b) => b !== s))} className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white" title="Remove from the board">×</button>
              </li>
            ))}
            {!board.length && <li className="font-mono text-[11px] text-white/40">Upload your intros, outros and signatures once; they stay here.</li>}
          </ul>
          <label className={`${BTN} inline-flex items-center cursor-pointer`}>
            Upload sounds
            <input type="file" accept=".mp3,audio/mpeg" multiple hidden onChange={(e) => { void uploadBoard([...(e.target.files ?? [])]); e.target.value = ''; }} />
          </label>
        </section>

        <section className="min-w-0">
          {/* the timeline: two lanes, so overlaps show */}
          <div
            ref={lane}
            className={`relative h-28 rounded-md border ${over ? 'border-white/60 bg-white/[0.05]' : 'border-white/12'} overflow-hidden select-none`}
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget || !lane.current) return;
              const p = ((e.clientX - lane.current.getBoundingClientRect().left) / lane.current.clientWidth) * T;
              setPos(p);
              if (playing) play(p);
            }}
          >
            {!clips.length && (
              <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-white/40 pointer-events-none">
                Drop songs here (several at once is fine)
              </div>
            )}
            {clips.map((c, i) => (
              <div
                key={c.id}
                onPointerDown={(e) => drag(e, i)}
                className={`absolute h-[46%] rounded border px-1.5 font-mono text-[10px] leading-[16px] truncate ${c.board ? 'border-vr-signal/60 bg-vr-signal/15' : 'border-white/30 bg-white/[0.07]'} ${i ? 'cursor-ew-resize' : ''}`}
                style={{ left: `${(at[i] / T) * 100}%`, width: `${(len(c) / T) * 100}%`, top: i % 2 ? '52%' : '2%' }}
                title={i ? 'Drag sideways to change the overlap' : undefined}
              >
                {c.name}
              </div>
            ))}
            <div className="absolute top-0 bottom-0 w-px bg-white pointer-events-none" style={{ left: `${(pos / T) * 100}%` }} />
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button className={BTN} disabled={!clips.length} onClick={() => (playing ? stop() : play())}>{playing ? 'Stop' : 'Play'}</button>
            <span className="font-mono text-[11px] text-white/60 tabular-nums">{mmss(pos)} / {mmss(total(clips))}</span>
            <label className={`${BTN} inline-flex items-center cursor-pointer`}>
              Add songs
              <input type="file" accept="audio/*" multiple hidden onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
            </label>
            {busy && <span className="font-mono text-[11px] text-white/50">{busy}</span>}
          </div>

          {/* each piece's settings */}
          {clips.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-5 gap-y-2 items-center min-w-[520px]">
                <span className={LABEL}>Piece</span><span className={LABEL}>Skip first (s)</span><span className={LABEL}>Overlap (s)</span><span className={LABEL}>Volume (dB)</span><span />
                {clips.map((c, i) => (
                  <div key={c.id} className="contents">
                    <span className="font-mono text-[11px] text-white/85 truncate">{c.name} <span className="text-white/35">{mmss(len(c))}</span></span>
                    <input className={NUM} type="number" min={0} step={1} value={c.start} onChange={(e) => edit(c.id, { start: Math.max(0, Math.min(c.buf.duration - 1, Number(e.target.value) || 0)) })} />
                    <input className={NUM} type="number" min={0} step={0.5} value={i ? c.fade : 0} disabled={!i} onChange={(e) => edit(c.id, { fade: Math.max(0, Number(e.target.value) || 0) })} />
                    <input className={NUM} type="number" step={1} value={c.gain} onChange={(e) => edit(c.id, { gain: Math.max(-30, Math.min(12, Number(e.target.value) || 0)) })} />
                    <span className="flex gap-2 font-mono text-[11px] text-white/50">
                      <button disabled={!i} className="hover:text-white disabled:opacity-20" onClick={() => swap(i, i - 1)} title="Earlier">↑</button>
                      <button disabled={i === clips.length - 1} className="hover:text-white disabled:opacity-20" onClick={() => swap(i, i + 1)} title="Later">↓</button>
                      <button className="hover:text-white" onClick={() => { stop(); setClips((cs) => cs.filter((x) => x.id !== c.id)); }} title="Remove">×</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* finish: render, encode, then on to the lineup */}
          <div className="flex flex-wrap items-center gap-3 mt-8 pt-5 border-t border-white/10">
            <input className="w-56 bg-transparent border-b border-white/25 pb-1 font-mono text-[11px] text-white outline-none focus:border-white/60" placeholder="Mix name" value={name} onChange={(e) => setName(e.target.value)} />
            <button className={BTN} disabled={!clips.length || progress !== null} onClick={() => void finish()}>Finish mix →</button>
            {progress !== null && <span className="font-mono text-[11px] text-white/60">Making the mix… {Math.round(progress * 100)}%</span>}
          </div>
          <p className="mt-2 font-mono text-[10px] text-white/35">Finishing turns the mix into one mp3 and opens Broadcast → Add to the lineup with it.</p>
        </section>
      </div>
    </div>
  );
}
