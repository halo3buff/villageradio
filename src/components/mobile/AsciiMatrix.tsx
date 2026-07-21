'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { useTheme } from '@/components/ThemeProvider';
import { LIGHT_THEMES } from '@/lib/theme';

/**
 * Colored glyph vectorscope — the reference GIF's grid of churning colored
 * cells (references/screenshots/insp_2.png), but driven exactly like the
 * vectorscope: every audio sample is plotted as a point at (x = R−L, y = L+R),
 * lighting up the cell it lands in. Lit cells hold a colored glyph and fade
 * with phosphor persistence; a fresh hit grabs a new hue + character (that's
 * the "colors and numbers changing"). So the colored figure you see IS the
 * stereo signal — loud/wide audio sprays cells across the grid, mono collapses
 * to a vertical line, silence fades to black. Idle tumbles a point-sphere, same
 * as the scope.
 *
 * Canvas (per-cell color); dark cells left transparent so the page background
 * shows through (theme-aware). Tap toggles the broadcast.
 */

const CELL = 14;
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#*+=<>/\\%?!$&';
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const FONT = `600 11px ${MONO}`;
const SAMPLES = 2000;
const DECAY = 0.72;     // phosphor persistence — lower = snappier, less smear
const FLOOR = 0.05;     // below this a cell is dark

// Live X-Y gain. Full-scale mono is (l+r)=2, so keep this well under 0.5·dim or
// the trace pins to the top/bottom edges. 0.30 leaves headroom for peaks.
const LIVE_GAIN = 0.30;

function randGlyph() { return GLYPHS[(Math.random() * GLYPHS.length) | 0]; }

// Amplitude above which a panel-mode cell reads as clipping and goes red.
const CLIP_AMP = 0.92;

// Line-printer density classes (references/screenshots/inspo_3.png): a '.' field
// with 0 / X / # marking rising accumulated density. Energy → glyph.
function densityGlyph(e: number): string {
  if (e < 0.05) return '.';
  if (e < 0.28) return '0';
  if (e < 0.58) return 'X';
  return '#';
}

/**
 * `panel` — a dot board. The whole lattice is always visible as a dim dot per
 * cell (the container reads even in silence); audio lights dots up, radius and
 * alpha scaling with energy. One hardware amber; a dot only goes red when the
 * live sample that lit it clipped. The hue buffer doubles as the clip flag.
 */
export function AsciiMatrix({ panel = false }: { panel?: boolean } = {}) {
  const { isPlaying, mode, carrierLost, analyserL, analyserR } = useAudio();

  // Empty cells are drawn as a dim field so the grid container is visible (the
  // reference shows every cell, dark ones included). Theme-aware: dark field on
  // dark themes, light field on light.
  const { name: theme } = useTheme();
  const light = LIGHT_THEMES.has(theme);
  const emptyRef = useRef({ bg: '#080808', ink: 'rgba(210,220,255,0.10)' });
  useEffect(() => {
    emptyRef.current = light
      ? { bg: '#e9e9ee', ink: 'rgba(0,0,0,0.13)' }
      : { bg: '#080808', ink: 'rgba(210,220,255,0.10)' };
  }, [light]);

  // Panel inks (theme-aware, monochrome). Line-printer density plot: `field` is
  // the faint '.' lattice; `strong` is the solid ink for the 0/X/# density
  // classes. No color — contrast is the whole point (see inspo_3.png).
  const panelInkRef = useRef({ field: '#000000', strong: '#000000' });
  useEffect(() => {
    panelInkRef.current = light
      ? { field: '#000000', strong: '#000000' }
      : { field: '#e8e4d9', strong: '#e8e4d9' };
  }, [light]);

  const isBroadcasting = mode === 'broadcast' && isPlaying;
  const liveRef = useRef(false);
  useEffect(() => { liveRef.current = isBroadcasting; }, [isBroadcasting]);
  const deadRef = useRef(false);
  useEffect(() => { deadRef.current = carrierLost; }, [carrierLost]);

  const aLRef = useRef<AnalyserNode | null>(null);
  const aRRef = useRef<AnalyserNode | null>(null);
  useEffect(() => { aLRef.current = analyserL; }, [analyserL]);
  useEffect(() => { aRRef.current = analyserR; }, [analyserR]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimsRef = useRef({ w: 0, h: 0, cols: 0, rows: 0, dpr: 1 });

  const bufLRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const bufRRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));

  // Per-cell phosphor buffers (row-major). acc = brightness, hue/char persist
  // for the life of a lit cell.
  const accRef = useRef<Float32Array>(new Float32Array(0));
  const hueRef = useRef<Float32Array>(new Float32Array(0));
  const chRef = useRef<string[]>([]);
  const srcRef = useRef('');
  const rafRef = useRef(0);

  const sphereRef = useRef<[number, number, number][]>([]);
  useEffect(() => {
    const N = 900, golden = Math.PI * (3 - Math.sqrt(5));
    const pts: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const rr = Math.sqrt(1 - y * y), th = i * golden;
      pts.push([Math.cos(th) * rr, y, Math.sin(th) * rr]);
    }
    sphereRef.current = pts;
  }, []);

  const resize = useCallback(() => {
    const el = canvasRef.current; if (!el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = el.clientWidth, h = el.clientHeight;
    const cols = Math.max(1, Math.floor(w / CELL));
    const rows = Math.max(1, Math.floor(h / CELL));
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    dimsRef.current = { w, h, cols, rows, dpr };
    const n = cols * rows;
    accRef.current = new Float32Array(n);
    hueRef.current = new Float32Array(n);
    chRef.current = Array.from({ length: n }, randGlyph);   // every cell has a glyph
  }, []);

  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [resize]);

  const draw = useCallback((now: number) => {
    const el = canvasRef.current; const ctx = el?.getContext('2d');
    const { w, h, cols, rows, dpr } = dimsRef.current;
    if (!ctx || cols === 0) { rafRef.current = requestAnimationFrame(draw); return; }

    const acc = accRef.current, hue = hueRef.current, ch = chRef.current;
    const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
    const R = Math.min(cols, rows) * 0.46;      // square scale → round figure
    const live = liveRef.current;
    const aL = aLRef.current, aR = aRRef.current;
    const src = deadRef.current ? 'dead' : (live && aL && aR) ? 'live' : 'idle';

    // wipe trails on a source switch so stopping doesn't smear the last frame
    if (src !== srcRef.current) { acc.fill(0); srcRef.current = src; }
    for (let i = 0; i < acc.length; i++) acc[i] *= DECAY;

    // A hit lights the cell; the rising edge (was-dark → lit) picks a fresh
    // color + glyph, which then persist while the cell fades.
    const hit = (x: number, y: number, amp: number) => {
      const c = Math.round(x), r = Math.round(y);
      if (c < 0 || c >= cols || r < 0 || r >= rows) return;
      const i = r * cols + c;
      if (acc[i] < FLOOR) { hue[i] = panel ? 0 : Math.random() * 360; ch[i] = randGlyph(); }
      if (panel && amp > CLIP_AMP && src === 'live') hue[i] = 1;   // red = the signal clipped, nothing else
      if (amp > acc[i]) acc[i] = amp;
    };

    if (src === 'dead') {
      const t = now * 0.001;
      for (let x = cx - R; x <= cx + R; x += 0.5) {
        hit(x, cy, 0.55 + 0.45 * Math.abs(Math.sin(x * 12.9898 + t * 2)));
      }
    } else if (src === 'live') {
      const bufL = bufLRef.current, bufR = bufRRef.current;
      aL!.getFloatTimeDomainData(bufL);
      aR!.getFloatTimeDomainData(bufR);
      const g = Math.min(cols, rows) * LIVE_GAIN;
      const stride = Math.max(1, Math.floor(bufL.length / SAMPLES));
      for (let i = 0; i < SAMPLES; i++) {
        const l = bufL[i * stride], r = bufR[i * stride];
        hit(cx + (r - l) * g, cy - (l + r) * g, Math.min(1, Math.hypot(l, r) * 1.4));
      }
    } else {
      // Idle: a tumbling point-sphere that churns like a plasma ball — bigger,
      // wobblier deformation and a breathing radius so it stays alive at rest.
      const t = now * 0.001;
      const Rs = R * 0.40 * (1 + 0.08 * Math.sin(t * 0.7));   // gentle breathing pulse
      const ry = t * 0.42, rxr = 0.30 * Math.sin(t * 0.5);
      const cosY = Math.cos(ry), sinY = Math.sin(ry), cosX = Math.cos(rxr), sinX = Math.sin(rxr);
      const pts = sphereRef.current;
      for (let i = 0; i < pts.length; i++) {
        const [px, py, pz] = pts[i];
        const def = 1
          + 0.14 * Math.sin(py * 3 + t * 1.3)
          + 0.11 * Math.sin(px * 4 - t * 0.9)
          + 0.09 * Math.sin(pz * 5 + t * 1.7)
          + 0.06 * Math.sin((px + py) * 6 - t * 2.2);
        const x = px * def, y = py * def, z = pz * def;
        const x1 = x * cosY - z * sinY, z1 = x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;
        hit(cx + x1 * Rs, cy + y1 * Rs, 0.28 + 0.72 * ((z2 + 1) / 2));
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = panel ? `${Math.round(CELL * 0.92)}px ${MONO}` : FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const { bg: emptyBg, ink: emptyInk } = emptyRef.current;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = c * CELL, y = r * CELL;
        const e = acc[i];
        if (panel) {
          // Monochrome line-printer density plot: every cell is a character,
          // the glyph chosen by accumulated density ('.' field → 0 → X → #).
          const pc = panelInkRef.current;
          const glyph = densityGlyph(e);
          ctx.fillStyle = glyph === '.' ? pc.field : pc.strong;
          ctx.fillText(glyph, x + CELL / 2, y + CELL / 2 + 0.5);
          continue;
        }
        if (e <= FLOOR) {
          // dim field cell — keeps the whole grid visible; slow glyph churn.
          if (Math.random() < 0.004) ch[i] = randGlyph();
          ctx.fillStyle = emptyBg;
          ctx.fillRect(x, y, CELL - 1, CELL - 1);
          ctx.fillStyle = emptyInk;
          ctx.fillText(ch[i], x + CELL / 2, y + CELL / 2 + 0.5);
          continue;
        }
        const lum = 32 + Math.min(1, e) * 34;
        ctx.fillStyle = `hsl(${hue[i]} 85% ${lum}%)`;
        ctx.fillRect(x, y, CELL - 1, CELL - 1);
        ctx.fillStyle = `hsl(${hue[i]} 95% ${Math.min(94, lum + 45)}%)`;
        ctx.fillText(ch[i], x + CELL / 2, y + CELL / 2 + 0.5);
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [panel]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: panel ? 'auto' : 'pixelated' }}
      />
    </div>
  );
}
