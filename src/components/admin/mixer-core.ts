// The mixer's sound engine, without the UI: what a clip is, how clips overlap and fade, and how they
// are laid onto a Web Audio context (the same plan plays the preview and renders the file).

import { LoudnessMeter, TARGET_LUFS } from '@/lib/audio/loudness';

export const RATE = 44100;
export const PEAKS_PER_S = 50;
export const VOICE = 0, DECK_A = 1, DECK_B = 2;

/** One piece on the timeline. at: where it starts in the mix (s). inT/outT: the part of the file that
 *  plays (s into the file). fadeIn/fadeOut: s. autoIn/autoOut: the fade follows the overlap with the
 *  neighbouring song. gain: dB. lane: VOICE (sound board, ducks the songs) or a deck. */
export interface Clip {
  id: number; name: string; lane: number; board: boolean;
  at: number; inT: number; outT: number;
  fadeIn: number; fadeOut: number; autoIn: boolean; autoOut: boolean; gain: number;
  buf: AudioBuffer; peaks: Float32Array;
}

export const len = (c: Pick<Clip, 'inT' | 'outT'>) => Math.max(0.05, c.outT - c.inT);
export const end = (c: Pick<Clip, 'at' | 'inT' | 'outT'>) => c.at + len(c);
export const total = (cs: Clip[]) => cs.reduce((m, c) => Math.max(m, end(c)), 0);
export const dbGain = (db: number) => Math.pow(10, db / 20);
export const mmss = (s: number, tenths = false) => {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${(tenths ? r.toFixed(1) : String(Math.floor(r))).padStart(tenths ? 4 : 2, '0')}`;
};

/** Loudest sample in each 1/PEAKS_PER_S of a second, for the waveform. */
export function peaksOf(buf: AudioBuffer): Float32Array {
  const step = Math.max(1, Math.round(buf.sampleRate / PEAKS_PER_S)), n = Math.ceil(buf.length / step);
  const out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      let m = out[i];
      for (let j = i * step, e = Math.min(d.length, j + step); j < e; j += 4) { const v = Math.abs(d[j]); if (v > m) m = v; }
      out[i] = m;
    }
  }
  return out;
}

/** Where the sound starts and stops, skipping silence at either end (s). */
export function audible(peaks: Float32Array, floor = 0.01): [number, number] {
  let a = 0, b = peaks.length - 1;
  while (a < b && peaks[a] < floor) a++;
  while (b > a && peaks[b] < floor) b--;
  return [Math.max(0, (a - 2) / PEAKS_PER_S), Math.min(peaks.length, b + 3) / PEAKS_PER_S];
}

/** The gain (dB) that brings a piece to the station's loudness, within reason. */
export function levelFor(buf: AudioBuffer): number {
  const m = new LoudnessMeter(buf.sampleRate, buf.numberOfChannels);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  m.push(chans);
  const l = m.lufs();
  return Number.isFinite(l) ? Math.round(Math.max(-15, Math.min(6, TARGET_LUFS - l))) : 0;
}

/** Songs that overlap crossfade over exactly the overlap, unless a fade was set by hand. */
export function autoFades(cs: Clip[]): Clip[] {
  const songs = cs.filter((c) => !c.board).sort((a, b) => a.at - b.at);
  const fix = new Map<number, Partial<Clip>>();
  songs.forEach((c, i) => {
    const prev = songs[i - 1], next = songs[i + 1];
    const inO = prev ? Math.max(0, Math.min(len(c), end(prev) - c.at)) : 0;
    const outO = next ? Math.max(0, Math.min(len(c), end(c) - next.at)) : 0;
    const p: Partial<Clip> = {};
    if (c.autoIn && c.fadeIn !== inO) p.fadeIn = inO;
    if (c.autoOut && c.fadeOut !== outO) p.fadeOut = outO;
    if (Object.keys(p).length) fix.set(c.id, p);
  });
  return fix.size ? cs.map((c) => (fix.has(c.id) ? { ...c, ...fix.get(c.id) } : c)) : cs;
}

/** A clip's volume over mix time, as points to ramp between. */
export function envelope(c: Clip): [number, number][] {
  const l = len(c), L = dbGain(c.gain);
  const fi = Math.min(c.fadeIn, l), fo = Math.min(c.fadeOut, l - fi);
  return [[c.at, fi ? 0 : L], [c.at + fi, L], [end(c) - fo, L], [end(c), fo ? 0 : L]];
}

/** Songs dip under the sound board's pieces. */
export function duckPoints(cs: Clip[], song: Clip, depthDb: number): [number, number][] {
  if (!depthDb) return [];
  const d = dbGain(-depthDb), pts: [number, number][] = [];
  const spans = cs.filter((c) => c.board && end(c) > song.at && c.at < end(song)).map((c) => [c.at, end(c)]).sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const s of spans) { const m = merged[merged.length - 1]; if (m && s[0] <= m[1] + 0.8) m[1] = Math.max(m[1], s[1]); else merged.push([...s]); }
  for (const [a, b] of merged) pts.push([a - 0.3, 1], [a, d], [b, d], [b + 0.6, 1]);
  return pts;
}

/** Ramps a parameter through piecewise-linear points, from mix time `from` on; nothing is scheduled in the past. */
function follow(p: AudioParam, pts: [number, number][], from: number, T: (t: number) => number, rest = 1) {
  const at = (t: number) => {
    if (!pts.length || t <= pts[0][0]) return pts.length ? pts[0][1] : rest;
    for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      return t1 > t0 ? v0 + ((v1 - v0) * (t - t0)) / (t1 - t0) : v1;
    }
    return pts[pts.length - 1][1];
  };
  p.setValueAtTime(at(from), T(from));
  for (const [t, v] of pts) if (t > from) p.linearRampToValueAtTime(v, T(t));
}

/** Lays the mix onto a context from `from` s in. lead: s of headroom before the first sound (realtime). */
export function schedule(ctx: BaseAudioContext, cs: Clip[], from: number, duckDb: number, lead = 0): AudioBufferSourceNode[] {
  const now = ctx.currentTime + lead, T = (t: number) => now + (t - from);
  const out: AudioBufferSourceNode[] = [];
  for (const c of cs) {
    const e = end(c);
    if (e <= from) continue;
    const start = Math.max(from, c.at);
    const src = ctx.createBufferSource(), fade = ctx.createGain();
    src.buffer = c.buf;
    follow(fade.gain, envelope(c), start, T);
    let node: AudioNode = src.connect(fade);
    if (!c.board) {
      const duck = ctx.createGain();
      follow(duck.gain, duckPoints(cs, c, duckDb), start, T);
      node = node.connect(duck);
    }
    node.connect(ctx.destination);
    src.start(T(start), c.inT + (start - c.at), e - start);
    out.push(src);
  }
  return out;
}
