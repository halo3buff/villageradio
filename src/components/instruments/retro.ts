/**
 * Shared primitives for the DSPower / Hypersignal-style instrument suite.
 *
 * The look these reproduce (see the real Signalogic screenshots —
 * signalogic.com/images/spectrograph{1,3,4}.gif): black plot background, pure
 * VGA magenta plot frames, yellow bitmap-font labels stacked letter-by-letter,
 * cyan status readouts, saturated cyan/yellow/green traces, aliased 1px lines,
 * an italic script "Hypersignal" watermark, and a yellow stats box at the
 * bottom of each plot.
 *
 * Every instrument renders BOTH site themes:
 *   solarized-dark → the exact 1995 look (VGA color on black)
 *   default (light) → the same grammar printed on white (black traces,
 *                     magenta frame, dark labels)
 */

export const MONO =
  "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

// ── theme-aware DSPower palette ────────────────────────────────────────────

export type DspPalette = {
  bg: string;        // plot background
  frame: string;     // magenta plot frame / axes
  frameDim: string;  // gridlines, dotted dividers
  label: string;     // axis labels + stats box text (yellow on dark)
  labelDim: string;
  readout: string;   // cyan header status line
  cyan: string;      // waterfall wireframe / unit circle
  yellow: string;    // wave traces
  green: string;     // FFT bars / poles
  select: string;    // white region-select rectangle / crosshair
  watermark: string; // italic script watermark
};

export function dspPalette(light: boolean): DspPalette {
  if (light) {
    // "DSPower printed on paper" — same grammar, default-theme colors
    return {
      bg: '#ffffff',
      frame: '#cc00cc',
      frameDim: 'rgba(204,0,204,0.30)',
      label: 'rgba(0,0,0,0.80)',
      labelDim: 'rgba(0,0,0,0.45)',
      readout: 'rgba(0,0,0,0.60)',
      cyan: '#000000',
      yellow: '#000000',
      green: '#000000',
      select: 'rgba(0,0,0,0.55)',
      watermark: 'rgba(204,0,204,0.60)',
    };
  }
  // exact Hypersignal VGA palette
  return {
    bg: '#000000',
    frame: '#ff00ff',
    frameDim: 'rgba(255,0,255,0.45)',
    label: '#ffff00',
    labelDim: 'rgba(255,255,0,0.55)',
    readout: '#00ffff',
    cyan: '#00ffff',
    yellow: '#ffff00',
    green: '#00ff00',
    select: 'rgba(255,255,255,0.85)',
    watermark: '#ff2050',
  };
}

// ── canvas helpers ─────────────────────────────────────────────────────────

/**
 * Init a canvas at 1:1 logical pixels (no devicePixelRatio upscale) with
 * smoothing off and CSS `image-rendering: pixelated`. On hi-dpi screens the
 * browser then nearest-neighbour-upscales the backing store — which is exactly
 * the chunky aliased look of the original displays.
 */
export function initRetroCanvas(el: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  el.width = Math.max(1, Math.round(w));
  el.height = Math.max(1, Math.round(h));
  el.style.imageRendering = 'pixelated';
  const ctx = el.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Bitmap-style font for canvas text. Canvas `font` can't resolve CSS var()
 *  (the var-based MONO string above silently fails in ctx.font), so resolve
 *  the VT323 family name from the root once and cache it. */
let pixelFamily: string | null = null;
export function pixelFont(size: number): string {
  if (pixelFamily === null && typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--font-vt323').trim();
    pixelFamily = v ? `${v}, 'Courier New', monospace` : "'Courier New', monospace";
  }
  return `${size}px ${pixelFamily ?? 'monospace'}`;
}

/** Vertical axis label, one letter per row — the Hypersignal "MAGNITUDE
 *  UNITS" style (letters stacked, not rotated). Spaces become row gaps. */
export function stackLabel(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, lineH: number,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let row = 0;
  for (const ch of text) {
    if (ch !== ' ') ctx.fillText(ch, x, y + row * lineH);
    row++;
  }
}

/** Italic script watermark ("Hypersignal" in the originals). */
export function watermark(
  ctx: CanvasRenderingContext2D, x: number, y: number, color: string,
  align: CanvasTextAlign = 'left', size = 12,
): void {
  ctx.save();
  ctx.font = `italic ${size}px 'Segoe Script', 'Brush Script MT', cursive`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Hypersignal', x, y);
  ctx.restore();
}

// legacy exports still used by the unused dark instruments + boot screens
export const CYAN = '0,229,229';
export const CYAN_DIM = 'rgba(0,229,229,0.34)';
export const GRID = 'rgba(0,210,210,0.16)';
export const GRID_HOT = 'rgba(0,229,229,0.42)';
export const MAGENTA = '196,52,168';
export const FRAME = 'rgba(196,52,168,0.85)';

/**
 * Hypersignal / DSPower 2-D contour colour ramp, low → high magnitude, from
 * the real "2-D Spectrograph (Contour)" displays: silence is black, the noise
 * floor mottles GRAY, then blue → cyan → green → magenta → red → yellow-white.
 */
export const CONTOUR: [number, number, number][] = [
  [0, 0, 0],       // silence — black
  [90, 90, 90],    // noise-floor gray speckle
  [20, 30, 140],   // blue
  [0, 140, 205],   // azure
  [0, 190, 170],   // teal
  [70, 200, 70],   // green
  [180, 70, 195],  // purple
  [228, 40, 160],  // magenta
  [245, 55, 55],   // red
  [250, 160, 30],  // orange
  [255, 250, 190], // yellow-white
];

export function contourColor(v: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, v / 255)) * (CONTOUR.length - 1);
  const i = Math.min(CONTOUR.length - 2, Math.floor(t));
  const f = t - i;
  const a = CONTOUR[i], b = CONTOUR[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/**
 * Average-downsample a frequency byte array into `count` bins normalised to 0..1.
 * `frac` restricts the source to its lower fraction (music energy lives well below
 * Nyquist, so 0.5 keeps the terrain/contour lively instead of mostly-empty).
 */
export function downsample(src: Uint8Array, count: number, out: Float32Array, frac = 1): void {
  const usable = Math.max(count, Math.floor(src.length * frac));
  const step = usable / count;
  for (let i = 0; i < count; i++) {
    const a = Math.floor(i * step);
    const b = Math.max(a + 1, Math.floor((i + 1) * step));
    let s = 0;
    for (let j = a; j < b; j++) s += src[j];
    out[i] = s / (b - a) / 255;
  }
}

// CRT scanline + phosphor-vignette overlay shared by every instrument pane.
export const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.16) 3px)';
