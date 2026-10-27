/**
 * plateKit — the station plate's print (mint stock, olive screen, mint light,
 * film grain) for the radar console's instruments. Colours from stationPlate.
 * mountPlate sizes a canvas to W × H plate units and runs `frame` every
 * animation frame with a Pen in those units.
 */

export const PAPER = '#eef8f1', INK = '#2b3626', SCREEN = '#36442e', YEL = '#f0c02c';
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
 * Looks: site themes the plates repaint themselves for. Rather than every instrument carrying a
 * palette per theme, a canvas made theme-aware (themeAware) translates its own mint/olive colours,
 * face and type as they're set, for plates (mountPlate) and the station plate alike.
 *   ega   — a DOS satellite tracker's screen: black, the standard 16 EGA colours, the VGA bitmap
 *           face, labels green and values yellow, no glow, a faint phosphor speckle.
 *   chart — an aeronautical chart: warm white paper, black ink, chart magenta and blue, ochre
 *           settlements, labels grey and values black, outlines only, no glow or grain.
 */
type Look = {
  colors: Record<string, string>;                         // exact plate colours → the look's
  tint: (rgb: string, a: number) => string | undefined;  // the plate's rgba(…) tints, by alpha
  label: string; value: string; stamp: string;            // two-colour type: label / value; a telex time
  face?: (size: number) => string;                        // a face of its own, else the plate's
  grain: number;                                          // screen grain opacity (0 = none)
  grid: string;                                           // the radar's lat/long grid
  frame?: string;                                         // an edge round each screen
};
const NONE = 'rgba(0,0,0,0)';
const E = {   // the EGA palette entries used
  black: '#000000', blue: '#0000aa', cyan: '#00aaaa', brown: '#aa5500',
  lblue: '#5555ff', lgreen: '#55ff55', lcyan: '#55ffff', lred: '#ff5555', lmagenta: '#ff55ff', yellow: '#ffff55', white: '#ffffff',
};
const C = {   // aeronautical chart inks
  paper: '#fbfaf6', ink: '#1a1a1a', grey: '#6b6b6b', magenta: '#b0127f', blue: '#1f4e9c', pale: '#c9d8ee',
  ochre: '#a8650f', sand: '#d9b27a', red: '#c8102e', mute: '#9a9a9a',
};
const TRACE_RGB = '98,242,182', YEL_RGB = '240,192,44', INK_RGB = '43,54,38', VIG_RGB = '10,16,8';
let vga = 'monospace';
const LOOKS: Record<string, Look> = {
  ega: {
    colors: {
      [PAPER]: E.black, [INK]: E.lcyan, [SCREEN]: E.black, [YEL]: E.yellow, [TRACE]: E.lgreen, [CORE]: E.white,
      '#7a2a10': E.lred, '#ff8a6a': E.lmagenta, '#fff': E.white,
      'rgba(255,255,255,0.18)': NONE, 'rgba(236,230,210,0.35)': E.lblue, 'rgba(255,255,255,0.028)': 'rgba(85,85,255,0.1)',
    },
    tint: (rgb, a) => rgb === TRACE_RGB ? (a < 0.2 ? NONE : a < 0.35 ? E.blue : a < 0.6 ? E.lblue : a < 0.75 ? E.lgreen : E.lcyan)
      : rgb === YEL_RGB ? (a < 0.2 ? NONE : a < 0.5 ? E.brown : E.yellow)
      : rgb === INK_RGB ? (a < 0.5 ? E.cyan : E.lcyan) : undefined,
    label: E.lgreen, value: E.yellow, stamp: E.lgreen,
    face: size => `${size * 1.5}px ${vga}, monospace`,   // VT323 sits small in its em: half again, a touch larger than the plate type
    grain: 0.35, grid: E.blue,
  },
  chart: {
    colors: {
      [PAPER]: C.paper, [INK]: C.ink, [SCREEN]: C.paper, [YEL]: C.ochre, [TRACE]: C.magenta, [CORE]: C.ink,
      '#7a2a10': C.red, '#ff8a6a': C.red, '#fff': C.ink,
      'rgba(255,255,255,0.18)': NONE, 'rgba(236,230,210,0.35)': C.blue, 'rgba(255,255,255,0.028)': '#e3ebf6',
    },
    tint: (rgb, a) => rgb === TRACE_RGB ? (a < 0.2 ? NONE : a < 0.35 ? C.pale : a < 0.6 ? C.blue : C.ink)
      : rgb === YEL_RGB ? (a < 0.2 ? NONE : a < 0.5 ? C.sand : C.ochre)
      : rgb === INK_RGB ? (a < 0.5 ? C.mute : C.ink)
      : rgb === VIG_RGB ? NONE : undefined,   // no vignettes on paper
    label: C.grey, value: C.ink, stamp: C.grey,
    grain: 0, grid: '#dce6f3', frame: C.ink,
  },
};
/** The look the page is in, or null for the plate's own mint stock. */
export const look = (): Look | null => (typeof document === 'undefined' ? null : LOOKS[document.documentElement.dataset.theme ?? ''] ?? null);
function translate(L: Look, c: string): string {
  if (L.colors[c]) return L.colors[c];
  const m = c.replace(/\s/g, '').match(/^rgba\((\d+,\d+,\d+),([\d.]+)\)$/);
  return (m && L.tint(m[1], +m[2])) || c;
}
// "KILLED 1,129", "FIELD REPORTS 24H 53": a label, then from its first figure the value
const LABEL_VALUE = /^([A-Z][A-Z .'/&()+-]*?[A-Z):]\s+)([-+]?\d[\s\S]*)$/;
const STAMP = /^(\d\d\.\d\d\.\d\d \d\d:\d\dZ )([\s\S]*)$/;   // a telex line's time

/** Route a context's colours, gradients, glow, face and plain type through the page's look. */
export function themeAware(ctx: CanvasRenderingContext2D) {
  const proto = CanvasRenderingContext2D.prototype;
  vga = getComputedStyle(document.documentElement).getPropertyValue('--font-vt323').trim() || vga;
  let fill = '';   // the fill colour as the instrument set it, before translation
  const prop = (key: 'fillStyle' | 'strokeStyle' | 'shadowColor' | 'shadowBlur' | 'font', map: (L: Look, v: unknown) => unknown) => {
    const d = Object.getOwnPropertyDescriptor(proto, key)!;
    Object.defineProperty(ctx, key, {
      get() { return d.get!.call(ctx); },
      set(v) {
        if (key === 'fillStyle') fill = typeof v === 'string' ? v : '';
        const L = look();
        d.set!.call(ctx, L ? map(L, v) : v);
      },
    });
  };
  const color = (L: Look, v: unknown) => (typeof v === 'string' ? translate(L, v) : v);
  prop('fillStyle', color);
  prop('strokeStyle', color);
  prop('shadowColor', color);
  prop('shadowBlur', () => 0);
  prop('font', (L, v) => {
    const m = L.face && typeof v === 'string' && !/arabic/i.test(v) && v.match(/([\d.]+)px/);
    return m ? L.face!(parseFloat(m[1])) : v;
  });
  // gradients (vignettes, the sweep) take their stops through the look too
  for (const k of ['createRadialGradient', 'createLinearGradient', 'createConicGradient'] as const) {
    const make = proto[k] as unknown as ((...a: number[]) => CanvasGradient) | undefined;
    if (!make) continue;
    (ctx as unknown as Record<string, unknown>)[k] = (...a: number[]) => {
      const g = make.apply(ctx, a), L = look();
      if (L) { const add = g.addColorStop.bind(g); g.addColorStop = (o: number, c: string) => add(o, translate(L, c)); }
      return g;
    };
  }
  // plain type in two colours, as charts and trackers print it: the label, then its value; a telex time
  const fillText = proto.fillText;
  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    const L = look(), plain = fill === INK || fill === 'rgba(98,242,182,0.8)';
    const m = L && plain && (text.match(STAMP) ?? text.match(LABEL_VALUE));
    if (!L || !m) return fillText.call(ctx, text, x, y, maxWidth);
    const [, a, b] = m, stamp = STAMP.test(text);
    const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width, align = ctx.textAlign;
    const x0 = align === 'right' || align === 'end' ? x - wa - wb : align === 'center' ? x - (wa + wb) / 2 : x;
    const keep = fill;
    ctx.textAlign = 'left';
    ctx.fillStyle = stamp ? L.stamp : L.label; fillText.call(ctx, a, x0, y);
    ctx.fillStyle = stamp ? translate(L, INK) : L.value; fillText.call(ctx, b, x0 + wa, y);
    ctx.textAlign = align; ctx.fillStyle = keep;
  };
}

export function mountPlate(cv: HTMLCanvasElement, W: number, H: number, frame: (p: Pen, now: number) => void) {
  const ctx = cv.getContext('2d')!;
  themeAware(ctx);
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
      const L = look();
      if (L) { if (L.frame) { ctx.strokeStyle = L.frame; ctx.lineWidth = 0.6; ctx.strokeRect(x, y, w, h); } return; }
      const vig = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(10,16,8,0.45)');
      ctx.fillStyle = vig; ctx.fillRect(x, y, w, h);
    },
    grain: (x, y, w, h) => {
      const a = look()?.grain ?? 1;
      if (!pattern || !a) return;
      const k = 1.6 / p.s;   // a grain is ~1.6 device pixels
      pattern.setTransform(new DOMMatrix([k, 0, 0, k, Math.random() * 160 * k, Math.random() * 160 * k]));
      ctx.save(); ctx.globalAlpha = a;
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
    (ctx as unknown as { letterSpacing: string }).letterSpacing = look()?.face ? '0px' : '0.5px';
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
