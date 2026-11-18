// A pocket software renderer for PS2-memory-card-style icons: low-poly parts, flat-shaded,
// painter-sorted, drawn soft (1x backing, upscaled by the browser) the way the console's were.

export type V3 = [number, number, number];
export type RGB = [number, number, number];
export interface Tri { p: [V3, V3, V3]; c: RGB }

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Every face is wound to point away from its part's centre, so parts can be built carelessly.
function face(out: Tri[], centre: V3, col: RGB, ...pts: V3[]) {
  for (let i = 1; i + 1 < pts.length; i++) {
    let t: [V3, V3, V3] = [pts[0], pts[i], pts[i + 1]];
    const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
    const mid: V3 = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
    if (dot(n, sub(mid, centre)) < 0) t = [t[0], t[2], t[1]];
    out.push({ p: t, c: col });
  }
}

export function box(out: Tri[], [x, y, z]: V3, [w, h, d]: V3, color: string) {
  const c = hex(color), X = w / 2, Y = h / 2, Z = d / 2;
  const v = (sx: number, sy: number, sz: number): V3 => [x + sx * X, y + sy * Y, z + sz * Z];
  const C: V3 = [x, y, z];
  face(out, C, c, v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1));
  face(out, C, c, v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1));
  face(out, C, c, v(-1, 1, -1), v(1, 1, -1), v(1, 1, 1), v(-1, 1, 1));
  face(out, C, c, v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1));
  face(out, C, c, v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1));
  face(out, C, c, v(-1, -1, -1), v(-1, 1, -1), v(-1, 1, 1), v(-1, -1, 1));
}

/** Cylinder from a to b; capColor defaults to the side colour. */
export function cyl(out: Tri[], a: V3, b: V3, r: number, n: number, color: string, capColor?: string) {
  const c = hex(color), cc = hex(capColor ?? color);
  const ax = norm(sub(b, a));
  const u = norm(cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const w = cross(ax, u);
  const ring = (o: V3) => Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2, s = Math.sin(t) * r, k = Math.cos(t) * r;
    return [o[0] + u[0] * k + w[0] * s, o[1] + u[1] * k + w[1] * s, o[2] + u[2] * k + w[2] * s] as V3;
  });
  const A = ring(a), B = ring(b);
  const C: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  for (let i = 0; i < n; i++) face(out, C, c, A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]);
  face(out, C, cc, ...A); face(out, C, cc, ...B);
}

export function sphere(out: Tri[], o: V3, r: number, color: string, lat = 5, lon = 8) {
  const c = hex(color);
  const P = (i: number, j: number): V3 => {
    const th = (i / lat) * Math.PI, ph = (j / lon) * Math.PI * 2;
    return [o[0] + r * Math.sin(th) * Math.cos(ph), o[1] + r * Math.cos(th), o[2] + r * Math.sin(th) * Math.sin(ph)];
  };
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    // the faces must lean out from the centre, so wind per quad against it
    if (i === 0) face(out, o, c, P(0, 0), P(1, j), P(1, j + 1));
    else if (i === lat - 1) face(out, o, c, P(i, j), P(i, j + 1), P(lat, 0));
    else face(out, o, c, P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j));
  }
}

const LIGHT = norm([-0.45, 0.6, 0.75]);
const CAM = 4.2;

/** Draw tris spun by `yaw` (tilted a touch toward the viewer) into a size×size canvas. */
export function render(ctx: CanvasRenderingContext2D, tris: Tri[], size: number, yaw: number, tilt = 0.22) {
  ctx.clearRect(0, 0, size, size);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  const xf = (p: V3): V3 => {
    const x = p[0] * cy + p[2] * sy, z0 = -p[0] * sy + p[2] * cy;
    return [x, p[1] * ct - z0 * st, p[1] * st + z0 * ct];
  };
  // rasterised at 2x into a depth buffer (painter's sort can't order big coplanar faces), then scaled down
  const N = size * 2, scale = N * 0.4;
  const off = (render as { off?: OffscreenCanvas | HTMLCanvasElement }).off ??= document.createElement('canvas');
  if (off.width !== N) { off.width = N; off.height = N; }
  const octx = off.getContext('2d') as CanvasRenderingContext2D;
  const img = octx.createImageData(N, N), px = img.data;
  const zb = new Float32Array(N * N).fill(-Infinity);
  for (const t of tris) {
    const q = t.p.map(xf) as [V3, V3, V3];
    const n = norm(cross(sub(q[1], q[0]), sub(q[2], q[0])));
    if (dot(n, sub([0, 0, CAM], q[0])) <= 0) continue; // facing away
    const l = 0.42 + 0.72 * Math.max(0, dot(n, LIGHT));
    const r = Math.min(255, t.c[0] * l), g = Math.min(255, t.c[1] * l), b = Math.min(255, t.c[2] * l);
    const s = q.map((p) => { const f = CAM / (CAM - p[2]); return [N / 2 + p[0] * f * scale, N / 2 - p[1] * f * scale, p[2]]; });
    const [A, B, C] = s;
    const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    if (Math.abs(area) < 1e-6) continue;
    const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(N - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(N - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const X = x + 0.5, Y = y + 0.5;
      const w0 = ((B[0] - X) * (C[1] - Y) - (B[1] - Y) * (C[0] - X)) / area;
      const w1 = ((C[0] - X) * (A[1] - Y) - (C[1] - Y) * (A[0] - X)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * A[2] + w1 * B[2] + w2 * C[2], i = y * N + x;
      if (z <= zb[i]) continue;
      zb[i] = z; px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, 0, 0, size, size);
}
