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

export function mountPlate(cv: HTMLCanvasElement, W: number, H: number, frame: (p: Pen, now: number) => void) {
  const ctx = cv.getContext('2d')!;
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
      const vig = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(10,16,8,0.45)');
      ctx.fillStyle = vig; ctx.fillRect(x, y, w, h);
    },
    grain: (x, y, w, h) => {
      if (!pattern) return;
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
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '0.5px';
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
