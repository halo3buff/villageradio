/**
 * Shared primitives for the DSPower / Hypersignal-style instrument suite on /listen.
 *
 * The look these reproduce: high-contrast cyan-on-black, aliased 1px lines, discrete
 * (non-interpolated) colour bands, fixed-width system type. Each instrument is a
 * standalone Canvas module that taps the shared AnalyserNodes from the audio context.
 */

export const MONO =
  "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

// phosphor cyan — the primary trace colour for the 3-D waterfall + vectorscope
export const CYAN = '0,229,229';
export const CYAN_DIM = 'rgba(0,229,229,0.34)';
export const GRID = 'rgba(0,210,210,0.16)';
export const GRID_HOT = 'rgba(0,229,229,0.42)';

// magenta window chrome, straight off the Hypersignal screenshots
export const MAGENTA = '196,52,168';
export const FRAME = 'rgba(196,52,168,0.85)';

/**
 * Hypersignal / DSPower 2-D contour colour ramp, low → high magnitude. Taken from the
 * real "2-D Spectrograph (Contour)" displays: silence is black, then the map climbs
 * blue → cyan → green → magenta → red → yellow-white. It is a smooth ~256-colour map
 * (the displays quote ≈0.3 dB/colour), so we LERP between these control points rather
 * than hard-stepping — the mottled texture comes from the FFT data itself.
 */
export const CONTOUR: [number, number, number][] = [
  [0, 0, 0],       // silence — black
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
