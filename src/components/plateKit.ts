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
 * The EGA theme (a DOS satellite tracker's screen): black, the standard 16-colour EGA palette as
 * solid colours, the VGA bitmap face, labels in green with their values in yellow, no glow.
 * Rather than every instrument carrying two palettes, a canvas made EGA-aware translates its own
 * mint/olive colours, fonts and type as they're set: plates (mountPlate) and the station plate.
 */
const E = {   // the EGA palette entries used
  black: '#000000', blue: '#0000aa', cyan: '#00aaaa', brown: '#aa5500', grey: '#aaaaaa',
  lblue: '#5555ff', lgreen: '#55ff55', lcyan: '#55ffff', lred: '#ff5555', lmagenta: '#ff55ff', yellow: '#ffff55', white: '#ffffff',
};
const NONE = 'rgba(0,0,0,0)';
const EGA: Record<string, string> = {
  [PAPER]: E.black, [INK]: E.lcyan, [SCREEN]: E.black, [YEL]: E.yellow, [TRACE]: E.lgreen, [CORE]: E.white,
  '#7a2a10': E.lred, '#ff8a6a': E.lmagenta, '#fff': E.white,
  'rgba(255,255,255,0.18)': NONE, 'rgba(236,230,210,0.35)': E.lblue, 'rgba(255,255,255,0.028)': 'rgba(85,85,255,0.1)',
};
/** A plate colour → its EGA counterpart. Faint washes (land fills) vanish: the tracker draws outlines. */
export function egaColor(c: string): string {
  if (EGA[c]) return EGA[c];
  const m = c.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  if (!m) return c;
  const [r, g, b, a] = [+m[1], +m[2], +m[3], +m[4]];
  if (r === 98 && g === 242 && b === 182) return a < 0.2 ? NONE : a < 0.35 ? E.blue : a < 0.6 ? E.lblue : a < 0.75 ? E.lgreen : E.lcyan;   // screen trace
  if (r === 240 && g === 192 && b === 44) return a < 0.2 ? NONE : a < 0.5 ? E.brown : E.yellow;   // settlements
  if (r === 43 && g === 54 && b === 38) return a < 0.5 ? E.cyan : E.lcyan;   // ink tints on the paper
  return c;
}
export const isEga = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'ega';
const EGA_TYPE = 1.5;   // VT323 sits small in its em: half again fills the line, a touch larger than the plate type
// "KILLED 1,129", "FIELD REPORTS 24H 53": a label, then from its first figure the value
const LABEL_VALUE = /^([A-Z][A-Z .'/&()+-]*?[A-Z):]\s+)([-+]?\d[\s\S]*)$/;
const STAMP = /^(\d\d\.\d\d\.\d\d \d\d:\d\dZ )([\s\S]*)$/;   // a telex line's time

/** Route a context's colours, glow, face and plain type through the EGA translation while that theme is on. */
export function egaAware(ctx: CanvasRenderingContext2D) {
  const proto = CanvasRenderingContext2D.prototype;
  const vga = getComputedStyle(document.documentElement).getPropertyValue('--font-vt323').trim() || 'monospace';
  let fill = '';   // the fill colour as the instrument set it, before translation
  const prop = (key: 'fillStyle' | 'strokeStyle' | 'shadowColor' | 'shadowBlur' | 'font', map: (v: unknown) => unknown) => {
    const d = Object.getOwnPropertyDescriptor(proto, key)!;
    Object.defineProperty(ctx, key, { get() { return d.get!.call(ctx); }, set(v) { d.set!.call(ctx, isEga() ? map(v) : v); } });
  };
  prop('fillStyle', v => { fill = typeof v === 'string' ? v : ''; return typeof v === 'string' ? egaColor(v) : v; });
  prop('strokeStyle', v => (typeof v === 'string' ? egaColor(v) : v));
  prop('shadowColor', v => (typeof v === 'string' ? egaColor(v) : v));
  prop('shadowBlur', () => 0);
  prop('font', v => {
    const m = typeof v === 'string' && !/arabic/i.test(v) && v.match(/([\d.]+)px/);
    return m ? `${parseFloat(m[1]) * EGA_TYPE}px ${vga}, monospace` : v;
  });
  // plain type in two colours, as the tracker prints it: label green, value yellow; a telex time green
  const fillText = proto.fillText;
  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    const plain = fill === INK || fill === 'rgba(98,242,182,0.8)';
    const m = isEga() && plain && (text.match(STAMP) ?? text.match(LABEL_VALUE));
    if (!m) return fillText.call(ctx, text, x, y, maxWidth);
    const [, a, b] = m, stamp = STAMP.test(text);
    const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width, align = ctx.textAlign;
    const x0 = align === 'right' || align === 'end' ? x - wa - wb : align === 'center' ? x - (wa + wb) / 2 : x;
    const keep = fill;
    ctx.textAlign = 'left';
    ctx.fillStyle = E.lgreen; fillText.call(ctx, a, x0, y);
    ctx.fillStyle = stamp ? E.lcyan : E.yellow; fillText.call(ctx, b, x0 + wa, y);
    ctx.textAlign = align; ctx.fillStyle = keep;
  };
}

export function mountPlate(cv: HTMLCanvasElement, W: number, H: number, frame: (p: Pen, now: number) => void) {
  const ctx = cv.getContext('2d')!;
  egaAware(ctx);
  const plex = getComputedStyle(document.documentElement).getPropertyValue('--font-ibm-plex-mono').trim();
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
      ctx.font = `700 ${size}px ${p.mono}`;
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
      if (!pattern) return;
      const k = 1.6 / p.s;   // a grain is ~1.6 device pixels
      pattern.setTransform(new DOMMatrix([k, 0, 0, k, Math.random() * 160 * k, Math.random() * 160 * k]));
      ctx.save(); if (isEga()) ctx.globalAlpha = 0.6;   // on black, a fainter phosphor speckle
      ctx.fillStyle = pattern; ctx.fillRect(x, y, w, h);
      ctx.restore();
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
