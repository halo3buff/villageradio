'use client';

import { useEffect, useRef } from 'react';
import { useAudio } from '@/lib/audio-context';

// 5x7 dot font: seven rows per glyph, each a base-32 digit whose 5 bits are the row's dots (left = 16).
const FONT: Record<string, string> = {
  'A': 'ehhvhhh', 'B': 'uhhuhhu', 'C': 'ehggghe', 'D': 'uhhhhhu', 'E': 'vgguggv', 'F': 'vgguggg', 'G': 'ehgnhhf', 'H': 'hhhvhhh', 'I': 'e44444e', 'J': '72222ic', 'K': 'hikokih', 'L': 'ggggggv', 'M': 'hrllhhh', 'N': 'hhpljhh', 'O': 'ehhhhhe', 'P': 'uhhuggg', 'Q': 'ehhhlid', 'R': 'uhhukih', 'S': 'fgge11u', 'T': 'v444444', 'U': 'hhhhhhe', 'V': 'hhhhha4', 'W': 'hhhllla', 'X': 'hha4ahh', 'Y': 'hhha444', 'Z': 'v1248gv', '0': 'ehjlphe', '1': '4c4444e', '2': 'eh1248v', '3': 'v2421he', '4': '26aiv22', '5': 'vgu11he', '6': '68guhhe', '7': 'v124888', '8': 'ehhehhe', '9': 'ehhf12c', '.': '00000cc', '-': '000v000', '/': '11248gg', ':': '0cc0cc0', '·': '000cc00', "'": 'c480000', '!': '4444404', '?': 'eh12404', '&': 'cik8lid', '+': '044v440', '(': '2488842', ')': '8422248', '#': 'aavavaa',
};
const glyph = (ch: string) => FONT[ch.toUpperCase()];
const dotOn = (ch: string, x: number, y: number) => {
  const g = glyph(ch);
  return !!g && (parseInt(g[y], 32) >> (4 - x) & 1) === 1;
};
const textW = (s: string) => s.length * 6 - 1;

const COLS = 64;
const LIT = [255, 204, 170];   // the station's peach
const OFF = 0.08;              // an unlit dot's glow
const LEVELS = 12;             // brightness steps, one path each

/**
 * The recording visual: the broadcast as a board of dots. The station's name on top, the music as
 * mirrored columns (bass in the middle, highs out to the edges) with falling peak dots, and a ticker
 * of what's on along the bottom. Fills its parent; tap it to tune in or out.
 */
export function DotMatrix() {
  const { analyserFreq, isPlaying, mode, carrierLost, currentTrack, broadcastPlay } = useAudio();
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ analyser: analyserFreq, on: false, title: '' });
  live.current = { analyser: analyserFreq, on: isPlaying && mode === 'broadcast' && !carrierLost, title: currentTrack?.title ?? '' };

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let freq = new Uint8Array(1024);
    const half = COLS / 2;
    const level = new Float32Array(half);
    const peak = new Float32Array(half);
    const hiMark = new Float32Array(half).fill(60);
    const loMark = new Float32Array(half).fill(255);
    const start = performance.now();

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const pitch = cv.width / COLS;
      const rows = Math.floor(cv.height / pitch);
      const top = (cv.height - rows * pitch) / 2;
      const t = (now - start) / 1000;
      const { analyser, on, title } = live.current;

      // ── the music: log-spaced bands, fast up, slow down ─────────────────
      let bass = 0;
      if (on && analyser) {
        if (freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freq);
        const nyq = analyser.context.sampleRate / 2;
        for (let i = 0; i < half; i++) {
          const lo = Math.floor((40 * Math.pow(14000 / 40, i / half)) / nyq * freq.length);
          const hi = Math.max(lo + 1, Math.floor((40 * Math.pow(14000 / 40, (i + 1) / half)) / nyq * freq.length));
          let m = 0;
          for (let k = lo; k < hi; k++) m = Math.max(m, freq[k]);
          // each column against its own recent range (a slow-falling top, a slow-rising floor), so the
          // whole board moves with the beat rather than the loudest bands filling and the rest lying flat
          hiMark[i] = Math.max(m, hiMark[i] * 0.997);
          loMark[i] = Math.min(m, loMark[i] + 0.15);
          const v = Math.pow(Math.max(0, m - loMark[i]) / (hiMark[i] - loMark[i] + 12), 2.2);
          level[i] = v > level[i] ? v : level[i] * 0.86;
        }
        bass = (level[0] + level[1] + level[2]) / 3;
      } else {
        // idle: a slow swell, so the board is never dead in shot
        for (let i = 0; i < half; i++) level[i] = 0.06 + 0.05 * Math.sin(t * 1.3 - i * 0.35) ** 2;
      }

      // ── what each dot is this frame (0..1) ──────────────────────────────
      const b = new Float32Array(COLS * rows).fill(OFF);
      const put = (x: number, y: number, v: number) => { if (x >= 0 && x < COLS && y >= 0 && y < rows) b[y * COLS + x] = Math.max(b[y * COLS + x], v); };
      const text = (s: string, x0: number, y0: number, v: number) => {
        for (let c = 0; c < s.length; c++) for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (dotOn(s[c], x, y)) put(x0 + c * 6 + x, y0 + y, v);
      };

      // name, two lines, breathing with the bass
      const name = 0.8 + 0.2 * Math.min(1, bass * 1.5);
      text('VILLAGE', Math.round((COLS - textW('VILLAGE')) / 2), 4, name);
      text('RADIO', Math.round((COLS - textW('RADIO')) / 2), 13, name);

      // ticker along the bottom, scrolling left
      const tickerY = rows - 11;
      const msg = (on ? `NOW · ${title || 'VILLAGE RADIO'} · 24/7 · VLGFM.LIVE · ` : 'TAP TO TUNE IN · VLGFM.LIVE · 24/7 · ').replace(/[^\x20-\x7e·]/g, ' ');
      const loop = msg.length * 6;
      const shift = Math.floor(t * 14) % loop;
      for (let c = -1; c * loop < COLS + loop; c++) text(msg, c * loop - shift, tickerY, 0.95);
      for (let x = 0; x < COLS; x += 2) { put(x, tickerY - 3, 0.25); put(x, rows - 2, 0.25); }

      // the music, mirrored about the middle row of the space between
      const y0 = 24, y1 = tickerY - 5;
      const mid = (y0 + y1) / 2, reach = (y1 - y0) / 2;
      for (let i = 0; i < half; i++) {
        const h = Math.min(reach, level[i] * reach * 1.1);
        peak[i] = Math.min(reach, Math.max(peak[i] - reach * 0.012, h));
        for (const x of [half - 1 - i, half + i]) {
          for (let d = 0; d <= h; d++) {
            const v = 0.45 + 0.55 * (1 - d / Math.max(1, reach));   // brightest near the middle
            put(x, Math.round(mid - d), v); put(x, Math.round(mid + d), v);
          }
          if (peak[i] > 1) { put(x, Math.round(mid - peak[i]), 1); put(x, Math.round(mid + peak[i]), 1); }
        }
      }

      // ── paint: one path per brightness step; the lit ones glow ──────────
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cv.width, cv.height);
      const r = pitch * 0.36;
      for (let l = 0; l < LEVELS; l++) {
        ctx.beginPath();
        for (let i = 0; i < b.length; i++) {
          if (Math.min(LEVELS - 1, Math.floor(b[i] * LEVELS)) !== l) continue;
          const cx = (i % COLS + 0.5) * pitch, cy = top + (Math.floor(i / COLS) + 0.5) * pitch;
          ctx.moveTo(cx + r, cy);
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
        }
        const a = (l + 0.5) / LEVELS;
        ctx.fillStyle = `rgba(${LIT[0]},${LIT[1]},${LIT[2]},${a})`;
        ctx.shadowColor = `rgba(${LIT[0]},${LIT[1]},${LIT[2]},${a * 0.8})`;
        ctx.shadowBlur = a > 0.3 ? pitch * 0.9 : 0;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // tap tunes in, never out: taps that bring back the frame choice mid-recording mustn't stop the music
  const tune = () => { if (!live.current.on) broadcastPlay(); };
  return <canvas ref={canvas} onClick={tune} style={{ display: 'block', width: '100%', height: '100%', cursor: 'pointer' }} />;
}
