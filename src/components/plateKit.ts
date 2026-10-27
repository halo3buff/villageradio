/**
 * plateKit — the station plate's print (mint stock, olive screen, mint light,
 * film grain) for the radar console's instruments. Colours from stationPlate.
 * mountPlate sizes a canvas to W × H plate units and runs `frame` every
 * animation frame with a Pen in those units.
 */

export const PAPER = '#3fd89e', INK = '#2b3626', SCREEN = '#36442e', YEL = '#f0c02c';
export const TRACE = '#62f2b6', CORE = '#c8ffe6';
export const SCREEN_INK = 'rgba(98,242,182,0.8)', SCREEN_DIM = 'rgba(98,242,182,0.3)';

export type Pen = {
  ctx: CanvasRenderingContext2D;
  s: number;      // device pixels per plate unit
  mono: string;
  t: (str: string, x: number, y: number, size?: number, color?: string, align?: CanvasTextAlign) => void;
  line: (x0: number, y0: number, x1: number, y1: number, color: string, w?: number) => void;
  /** the dark print window, vignetted */
  screen: (x: number, y: number, w: number, h: number) => void;
  /** grain over a screen, at a fresh offset each frame */
  grain: (x: number, y: number, w: number, h: number) => void;
};

/**
 * The EGA theme (DOS satellite-tracker look): black, the 16-colour EGA palette, no glow or grain,
 * the VGA bitmap face. Rather than every instrument carrying two palettes, the plate's own colours
 * are translated as they're set on the context: each mint/olive value to its EGA counterpart.
 */
const EGA: Record<string, string> = {
  [PAPER]: '#000000', [INK]: '#55ffff', [SCREEN]: '#000000', [YEL]: '#ffff55', [TRACE]: '#55ff55', [CORE]: '#ffffff',
  '#7a2a10': '#ff5555', '#ff8a6a': '#ff55ff', '#fff': '#ffffff', 'rgba(255,255,255,0.18)': 'rgba(0,0,0,0)',
};
function egaColor(c: string): string {
  if (EGA[c]) return EGA[c];
  const m = c.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  if (!m) return c;
  const [r, g, b, a] = [+m[1], +m[2], +m[3], +m[4]];
  if (r === 98 && g === 242 && b === 182) return a < 0.5 ? `rgba(85,85,255,${Math.min(1, a * 2.5)})` : `rgba(85,255,85,${a})`;   // screen trace: dim → blue grid, bright → green
  if (r === 240 && g === 192 && b === 44) return `rgba(255,255,85,${a})`;
  if (r === 43 && g === 54 && b === 38) return `rgba(85,255,255,${a})`;
  return c;
}
const isEga = () => document.documentElement.dataset.theme === 'ega';

/** Route the context's colour and glow through the EGA translation while that theme is on. */
function egaAware(ctx: CanvasRenderingContext2D) {
  const proto = CanvasRenderingContext2D.prototype;
  for (const key of ['fillStyle', 'strokeStyle', 'shadowColor'] as const) {
    const d = Object.getOwnPropertyDescriptor(proto, key)!;
    Object.defineProperty(ctx, key, {
      get() { return d.get!.call(ctx); },
      set(v) { d.set!.call(ctx, typeof v === 'string' && isEga() ? egaColor(v) : v); },
    });
  }
  const blur = Object.getOwnPropertyDescriptor(proto, 'shadowBlur')!;
  Object.defineProperty(ctx, 'shadowBlur', { get() { return blur.get!.call(ctx); }, set(v) { blur.set!.call(ctx, isEga() ? 0 : v); } });
}

export function mountPlate(cv: HTMLCanvasElement, W: number, H: number, frame: (p: Pen, now: number) => void) {
  const ctx = cv.getContext('2d')!;
  egaAware(ctx);
  const css = getComputedStyle(document.documentElement);
  const plex = css.getPropertyValue('--font-ibm-plex-mono').trim();
  const vga = css.getPropertyValue('--font-vt323').trim();
  const g = document.createElement('canvas');
  g.width = g.height = 160;
  const gc = g.getContext('2d')!, img = gc.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random(), light = v > 0.5;
    img.data[i] = light ? 120 : 10; img.data[i + 1] = light ? 255 : 18; img.data[i + 2] = light ? 190 : 12;
    img.data[i + 3] = Math.abs(v - 0.5) ** 2 * 4 * 255 * 0.18;
  }
  gc.putImageData(img, 0, 0);
  const pattern = ctx.createPattern(g, 'repeat');

  const p: Pen = {
    ctx, s: 1, mono: `${plex || 'Consolas'}, Consolas, monospace`,
    t: (str, x, y, size = 6.5, color = INK, align = 'left') => {
      // VT323 sits small in its em: a third larger fills the same line
      ctx.font = isEga() ? `400 ${size * 1.35}px ${vga || 'monospace'}, monospace` : `700 ${size}px ${p.mono}`;
      ctx.fillStyle = color; ctx.textAlign = align;
      ctx.fillText(str.toUpperCase(), x, y);
    },
    line: (x0, y0, x1, y1, color, w = 0.6) => {
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    },
    screen: (x, y, w, h) => {
      ctx.fillStyle = SCREEN; ctx.fillRect(x, y, w, h);
      if (isEga()) return;
      const vig = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(10,16,8,0.45)');
      ctx.fillStyle = vig; ctx.fillRect(x, y, w, h);
    },
    grain: (x, y, w, h) => {
      if (!pattern || isEga()) return;
      const k = 1.6 / p.s;   // a grain is ~1.6 device pixels
      pattern.setTransform(new DOMMatrix([k, 0, 0, k, Math.random() * 160 * k, Math.random() * 160 * k]));
      ctx.fillStyle = pattern; ctx.fillRect(x, y, w, h);
    },
  };

  const resize = () => {
    p.s = (cv.clientWidth / W) * (window.devicePixelRatio || 1);
    cv.width = Math.round(W * p.s); cv.height = Math.round(H * p.s);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(cv);

  let raf = 0;
  const loop = (now: number) => {
    ctx.setTransform(p.s, 0, 0, p.s, 0, 0);
    (ctx as unknown as { letterSpacing: string }).letterSpacing = isEga() ? '0px' : '0.5px';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    frame(p, now);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); };
}

/** Pointer position in plate units. */
export function platePoint(cv: HTMLCanvasElement, W: number, H: number, e: PointerEvent) {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
