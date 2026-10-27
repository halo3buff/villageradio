import { THIRD_OCTAVE } from '@/lib/dsp';
import { THEMES, paletteColor } from '@/lib/theme';
import seedCommands from '@/lib/content/seed/commands.json';
import type { Metrics } from './AnalogueStrip';
import { isEga } from './plateKit';

/**
 * stationPlate — the station drawn as a printed instrument plate: black
 * stock, cream ink, one dark screen carrying yellow annotations. The layout
 * follows the reference plate position for position; what fills it is this
 * station's own measurements (see AnalogueStrip, which computes them and
 * calls drawPlate every frame).
 *
 *   screen centre      -> the Lissajous stereo field
 *   screen annotations -> true peak / loudness, compliance, threshold checks
 *   screen left boxes  -> four band-level meters
 *   dot matrix (left)  -> third-octave spectrum, mirrored about the label row
 *   dot matrix (right) -> a scrolling bit pattern keyed off the band levels
 */

// Desktop: true = one row, the readouts and matrices with the Lissajous on a
// small screen at the far left; false = the full plate, header and the big
// screen above that same lower portion. Phones always get the stack: the
// Lissajous full width on top, the lower portion cut into pieces under it.
const ROW = true;
const HDR = 50;                            // the header band above the row
const HDR_STACK = 30;                      // the stack's: just the clock
const ROW_DX = 168, ROW_DY = -386 + HDR;  // where the lower portion lands in the row
// what the row keeps of the lower portion, and where each piece moves to
const ROW_PIECES = [
  [367, 404, 460, 455, -337, 0],    // MID/SIDE, test signal
  [30, 404, 150, 452, 103, 0],      // readouts
  [195, 500, 355, 528, -162, -26],  // uptime, FFT
  [370, 509, 460, 531, -165, -30],  // true-peak overs
  [193, 532, 335, 571, -160, -8],   // HDRM, L/R, corr
  [352, 532, 462, 572, -167, -8],   // RMS, on since
  [484, 402, 574, 571, -182, 0],    // band levels, bit matrix
];

// The stack under the screen: just a three-column readout table (see readouts
// in drawPlate); the spectrum dots live on the StationBar.
const S_X0 = 22, S_X1 = 339;                // content edges
const S_TOP = HDR_STACK + 22;               // the screen's top edge
const READ_Y = 8, READ_H = 70;              // the readout table, below the screen
const STACK_REST = READ_Y + READ_H + 7;
// The screen is as tall as the phone allows: fitStack sizes it so the whole
// stack fills the space it's given exactly. The field inside stays round.
const LISS_MIN = 120, LISS_MAX = S_X1 - S_X0;
let lissH = LISS_MAX;
export const STACK_MIN_H = S_TOP + LISS_MIN + STACK_REST;

// Plate units. btn is the badge on the screen; AnalogueStrip docks the play
// button on it.
export type PlateDims = { w: number; h: number; btn: { x: number; y: number; w: number; h: number } };
const FULL: PlateDims = { w: 600, h: 600, btn: { x: 198, y: 67, w: 49, h: 32 } };
const WIDE: PlateDims = { w: 598, h: 200 + HDR, btn: { x: 27, y: 27 + HDR, w: 24, h: 15 } };
const TALL: PlateDims = { w: 372, h: S_TOP + lissH + STACK_REST, btn: { x: 27, y: 27 + HDR_STACK, w: 36, h: 22 } };
export const plateDims = (stack: boolean) => (stack ? TALL : ROW ? WIDE : FULL);
/** Size the stack to an available height / width ratio. */
export function fitStack(ratio: number) {
  lissH = Math.round(clamp(ratio * TALL.w - S_TOP - STACK_REST, LISS_MIN, LISS_MAX));
  TALL.h = S_TOP + lissH + STACK_REST;
}

// The mint report-cover stock: dark olive ink on mint, and the screen a dark
// olive print window with the trace glowing through in the stock's own mint.
// Colours sampled from the reference cover.
const PAPER = '#3fd89e';
const INK = '#2b3626';
const SCREEN = '#36442e';
const YEL = '#f0c02c';
const TRACE = '#62f2b6';   // the Lissajous trace, mint light through the print
const SCREEN_INK = 'rgba(98,242,182,0.8)';   // type on the screen
const SCREEN_DIM = 'rgba(98,242,182,0.3)';   // the screen's graticule

// film grain over the screen: one random tile, drawn at a fresh offset each frame
let grain: CanvasPattern | null = null;
function grainPattern(ctx: CanvasRenderingContext2D) {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d')!;
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random();
    const light = v > 0.5;
    img.data[i] = light ? 120 : 10; img.data[i + 1] = light ? 255 : 18; img.data[i + 2] = light ? 190 : 12;
    img.data[i + 3] = Math.abs(v - 0.5) ** 2 * 4 * 255 * 0.18;
  }
  g.putImageData(img, 0, 0);
  return (grain = ctx.createPattern(c, 'repeat'));
}
// the waterfall's glowing dots: scope blue and the README's command colours
const GLOWS = [TRACE, ...new Set(seedCommands.commands.map(c => paletteColor(THEMES.default, c.cmd)))];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '--.-');
const f0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : '--');
const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '-.--');

// the right-hand matrix: one row of band-level bits pushed every ROW_MS
const BIT_COLS = 24, BIT_ROWS = 29, ROW_MS = 200;   // the stack shows the newest 16
const bitRows: number[] = [];
const glowRows: number[] = [];   // per row, the one bit (if any) that glows
const glowCols: string[] = [];   // and its colour
const hold = [-Infinity, -Infinity];   // the row's L/R meters' peak holds, dB
let lastRow = 0;

type Align = 'left' | 'right' | 'center';

export function drawPlate(ctx: CanvasRenderingContext2D, s: number, m: Metrics, mono: string, stack = false) {
  const { w: W, h: H, btn } = plateDims(stack);
  const plate = !stack && !ROW;
  const hdr = stack ? HDR_STACK : HDR;
  const snap = (v: number) => (Math.round(v * s) + 0.5) / s;

  const t = (str: string, x: number, y: number, size = 6.5, color = INK, align: Align = 'left') => {
    ctx.font = `700 ${size}px ${mono}`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str.toUpperCase(), x, y);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, color = INK, w = 0.8) => {
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath();
    // hairlines on the pixel grid, so rules print crisp
    if (x0 === x1) { ctx.moveTo(snap(x0), y0); ctx.lineTo(snap(x1), y1); }
    else if (y0 === y1) { ctx.moveTo(x0, snap(y0)); ctx.lineTo(x1, snap(y1)); }
    else { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
    ctx.stroke();
  };
  const box = (x: number, y: number, w: number, h: number, color = INK, lw = 0.8) => {
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.strokeRect(snap(x), snap(y), snap(x + w) - snap(x), snap(y + h) - snap(y));
  };
  const dot = (x: number, y: number, r: number, color = INK) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };

  // tracked caps, like the plate's type; ignored where canvas lacks it
  (ctx as unknown as { letterSpacing: string }).letterSpacing = '0.5px';

  const tp = Math.max(m.tpL, m.tpR);
  const width = f0((1 - m.corr) * 50);
  const phase = f0(Math.acos(clamp(m.corr, -1, 1)) * 57.2958);
  const iso = new Date().toISOString();

  // the stereo field: x = right, y = left; the diagonals are mono / anti-phase
  // R / Ry = horizontal / vertical radius
  const field = (cx: number, cy: number, R: number, Ry = R) => {
    const dim = SCREEN_DIM;
    line(cx - R, cy, cx + R, cy, dim, 0.6);
    line(cx, cy - Ry, cx, cy + Ry, dim, 0.6);
    ctx.setLineDash([3, 4]);
    line(cx - R, cy + Ry, cx + R, cy - Ry, dim, 0.6);
    line(cx - R, cy - Ry, cx + R, cy + Ry, dim, 0.6);
    ctx.setLineDash([]);
    for (const v of [-1, -0.5, 0.5, 1]) {
      line(cx + v * R, cy - 2.5, cx + v * R, cy + 2.5, dim, 0.6);
      line(cx - 2.5, cy - v * Ry, cx + 2.5, cy - v * Ry, dim, 0.6);
    }
    t('XL', cx + 4, cy - Ry + 5, 5, SCREEN_INK);
    t('XR', cx + R - 9, cy - 4, 5, SCREEN_INK);
    // mint light through the print: one path, filled as a wide haze, a glow, then a soft core
    ctx.beginPath();
    for (let k = 0; k < m.lHead; k++) {
      ctx.rect(cx + clamp(m.lx[k], -1, 1) * R - 0.7, cy - clamp(m.ly[k], -1, 1) * Ry - 0.7, 1.4, 1.4);
    }
    ctx.save();
    ctx.fillStyle = TRACE; ctx.shadowColor = TRACE;
    ctx.globalAlpha = 0.35; ctx.shadowBlur = 18 * s; ctx.fill();
    ctx.globalAlpha = 0.8; ctx.shadowBlur = 6 * s; ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 0.6; ctx.fillStyle = '#c8ffe6'; ctx.fill();
    ctx.restore();
  };
  const badge = () => {
    // transport badge — the play button sits over this
    ctx.fillStyle = INK; ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
  };

  // ── stock and frame ──────────────────────────────────────────────────────
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  // in the row the frame holds only the row; header and STEREO sit outside it
  if (plate) box(8, 8, W - 16, H - 16, INK, 0.6);
  else if (!stack) box(8, hdr + 8, W - 36, H - hdr - 16, INK, 0.6);   // the stack goes frameless

  // ── header: clock, sample rate, date, and STEREO down the side ──────────
  // L / R = left and right edges of the content, cx = the clock's centre
  const header = (L: number, cx: number, R: number) => {
    // in the row the clock sits on the header line, level with SR and the date
    const cy = plate ? 17 : hdr - 14;
    // the stack's clock is the StationBar's, pinned above it
    if (!stack) {
      box(cx - 26, cy, 52, 13);
      t(iso.slice(11, 19), cx, cy + 9.5, 7.5, INK, 'center');
    }
    // ± and STEREO hang off the frame's top corner
    const o = plate ? 0 : hdr - HDR + (stack ? 26 : 0);   // the stack's sits beside the screen
    t('±', R + 10, 53 + o, 9, INK, 'center');
    line(R + 10, 58 + o, R + 10, 66 + o);
    ctx.save();
    ctx.translate(R + 7, 72 + o); ctx.rotate(Math.PI / 2);
    t('STEREO', 0, 0, 7.5);
    ctx.restore();
    if (stack) return;   // the phone keeps only the clock and STEREO
    t(`SR ${(m.sr / 1000).toFixed(1)} K`, L, 43, 7.5);
    t(`${iso.slice(5, 7)}.-${iso.slice(8, 10)}.${iso.slice(2, 4)}/ ${m.live ? 'ON AIR' : 'TEST'}`, R, 43, 7.5, INK, 'right');
    for (const [a, b] of [[L, L + 43], [L + 49, L + 95], [L + 103, L + 153], [R - 111, R - 63], [R - 57, R]]) {
      line(a, 49, b, 49, INK, 1.2);
    }
  };

  if (!plate) {
    if (stack) header(10, 180, 351); else header(10, 291, 568);
    // ── the small screen: the stereo field, far left / on top, on the stock ──
    const X = 22, Y = 22 + hdr, D = stack ? LISS_MAX : 156, DH = stack ? lissH : D;
    // the print window: dark olive, a soft vignette, the field, then grain over all of it
    ctx.fillStyle = SCREEN; ctx.fillRect(X, Y, D, DH);
    const vig = ctx.createRadialGradient(X + D / 2, Y + DH / 2, Math.min(D, DH) * 0.2, X + D / 2, Y + DH / 2, Math.max(D, DH) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(10,16,8,0.45)');
    ctx.fillStyle = vig; ctx.fillRect(X, Y, D, DH);
    field(X + D / 2, Y + DH / 2 + DH / 39, Math.min(D, DH) * 0.4);
    // the stack's transport is the StationBar's: no badge, just the state in the corner
    if (stack) t(m.live ? '[ ON AIR ]' : '[ PLAY ]', X + 6, Y + 13, 8.5, SCREEN_INK);
    else {
      badge();
      t(m.live ? '[ ON AIR ]' : '[ PLAY ]', btn.x + btn.w + 4, btn.y + btn.h / 2 + 2.5, 6.5, SCREEN_INK);
    }
    t(`r ${f2(m.corr)}`, X + 5, Y + DH - 5, 5.5, SCREEN_INK);
    t(`WIDTH ${width}%`, X + D - 5, Y + DH - 5, 5.5, SCREEN_INK, 'right');
    const gp = grainPattern(ctx);
    if (gp) {
      const k = 1.6 / s;   // a grain is ~1.6 device pixels
      gp.setTransform(new DOMMatrix([k, 0, 0, k, Math.random() * 160 * k, Math.random() * 160 * k]));
      ctx.save(); if (isEga()) ctx.globalAlpha = 0.35;   // on black, a faint phosphor speckle
      ctx.fillStyle = gp; ctx.fillRect(X, Y, D, DH);
      ctx.restore();
    }
  } else {
    header(35, 298, 563);

    // ── the screen ───────────────────────────────────────────────────────────
    const SX = 33, SY = 57, SW = 530, SH = 341;
    ctx.fillStyle = SCREEN; ctx.fillRect(SX, SY, SW, SH);
    // the weave of the print
    ctx.strokeStyle = 'rgba(255,255,255,0.028)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = SX + 5; x < SX + SW; x += 5) { ctx.moveTo(x, SY); ctx.lineTo(x, SY + SH); }
    for (let y = SY + 5; y < SY + SH; y += 5) { ctx.moveTo(SX, y); ctx.lineTo(SX + SW, y); }
    ctx.stroke();
    box(SX, SY, SW, SH, 'rgba(236,230,210,0.35)', 0.6);   // on black the screen needs an edge

    box(57, 68, 129, 17, YEL, 0.7);
    t(`TRUE PEAK ${f1(tp)} DBTP`, 121.5, 75.5, 5.5, YEL, 'center');
    t(`LUFS-S ${f1(m.short)}  LRA ${f1(m.lra)}`, 121.5, 82, 5.5, YEL, 'center');

    badge();
    t(m.live ? '[ ON AIR ]' : '[ PLAY ]', btn.x + btn.w / 2, 106, 5, YEL, 'center');

    const checks: [string, boolean][] = [
      ['CEILING -1.0 DBTP', tp <= -1],
      ['TARGET -14 LUFS', Number.isFinite(m.integ) && Math.abs(m.integ + 14) <= 2],
      ['LRA > 3 LU', m.lra > 3],
      ['r > 0', m.corr > 0],
      ['NO SILENCE', !m.silence],
    ];
    const passed = checks.filter(c => c[1]).length;
    box(430, 66, 111, 11, YEL, 0.7);
    t(`COMPLIANCE ${Math.round((passed / checks.length) * 100)}%  ${passed}/${checks.length} PASS.`, 485.5, 74, 5.5, YEL, 'center');

    // four band meters, stacked as the plate's boxes are
    const meters: [number, number][] = [[283, 25], [311, 34], [349, 11], [363, 25]];
    meters.forEach(([y, h], i) => {
      const n = clamp((m.gLevel[3 - i] + 70) / 60, 0, 1);
      ctx.fillStyle = YEL; ctx.fillRect(44, y + h * (1 - n), 8, h * n);
      box(44, y, 8, h, YEL, 0.7);
    });

    field(298, 228, 112);

    checks.slice(0, 2).forEach(([l, ok], i) =>
      t(`${l}  ${ok ? 'PASS' : 'FAIL'}.`, 537, 358 + i * 8, 5.5, YEL, 'right'));
    t(`r ${f2(m.corr)}  WIDTH ${width}%  PHASE ${phase} DEG.`, 537, 382, 5.5, YEL, 'right');
    line(463, 387, 463, 398, YEL, 0.7);
  }

  // the lower portion is laid out in full-plate coordinates; in the row it
  // slides up and right, on the stack it's cut into pieces stacked under the
  // screen. Moves are by whole device pixels so the hairlines stay crisp.
  // the stack's readout table: three columns under tags, rules between
  function readouts(top: number) {
    const mid = m.rms + 20 * Math.log10(Math.max(0.05, (1 + m.corr) / 2));
    const side = m.rms + 20 * Math.log10(Math.max(0.05, (1 - m.corr) / 2));
    const cols: [string, string[]][] = [
      ['LOUDNESS', [
        `PGM ${f1(m.mom)} LUFS`, `INT ${f1(m.integ)}`, `TPL ${f1(m.tpL)}`, `TPR ${f1(m.tpR)}`,
        `PLR ${f1(m.plr)} PSR ${f1(m.psr)}`,
        `HDRM ${f1(-1 - tp)} TGT ${Number.isFinite(m.integ) ? f1(m.integ + 14) : '--.-'}`,
      ]],
      ['SPECT', [
        `CREST ${f1(m.crest)} DB`,
        `CENTROID ${m.centroid >= 1000 ? `${(m.centroid / 1000).toFixed(2)}K` : f0(m.centroid)}`,
        `SLOPE ${f1(m.slope)} /OCT`, 'FFT 8192', `BIN ${(m.sr / 8192).toFixed(1)} HZ`, 'WINDOW 43 MS',
      ]],
      ['MID/SIDE', [
        `MID ${f1(mid)}`, `SIDE ${f1(side)} DB`, `RMS ${f1(m.rms)} PK ${f1(Math.max(m.pkL, m.pkR))}`,
        `SILENCE ${m.silence ? 'Y' : 'N'}, OVERS ${m.overs}.`, `UPTIME ${f0(m.since)} S`,
        `> ${m.live ? (tp > -1 ? 'HOT' : 'ON AIR') : 'TEST SIGNAL'} <`,
      ]],
    ];
    const PAD = 7;   // inside the box that encloses the table
    const cw = (S_X1 - S_X0 - 2 * PAD) / 3;
    cols.forEach(([tag, rows], c) => {
      const x = S_X0 + PAD + c * cw + (c ? 7 : 0);
      if (c) line(x - 7, top, x - 7, top + READ_H);
      const w = tag.length * 4 + 9;
      box(x, top, w, 9.5);
      t(tag, x + w / 2, top + 7, 5.5, INK, 'center');
      rows.forEach((r, i) => t(r, x, top + 21 + i * 9.8, 6.5));
    });
  }
  const px = (v: number) => Math.round(v * s) / s;
  if (stack) {
    const base = S_TOP + lissH;
    // enclosed in the screen's own border, its bottom edge doubling as this box's top
    box(S_X0, base, S_X1 - S_X0, READ_Y + READ_H + 4, INK, 0.6);
    readouts(base + READ_Y);
  } else {
    ctx.save();
    if (ROW) {
      // the row keeps only some of the lower portion, closed up: pieces cut
      // from it and moved [x0, y0, x1, y1, dx, dy]
      ctx.translate(px(ROW_DX), px(ROW_DY));
      line(27, 462, 296, 462);
      for (const [x0, y0, x1, y1, dx, dy] of ROW_PIECES) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
        lower();
        ctx.restore();
      }
      meters();
    } else lower();
    ctx.restore();
  }
  (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';

  // the row's L/R peak meters, after the readouts: bars with a falling hold
  function meters() {
    const top = 408, h = 36;
    [m.pkL, m.pkR].forEach((pk, i) => {
      hold[i] = Math.max(Number.isFinite(pk) ? pk : -60, hold[i] - 0.25);
      const x = 262 + i * 11, n = (v: number) => clamp((v + 60) / 60, 0, 1);
      ctx.fillStyle = INK; ctx.fillRect(x, top + h * (1 - n(pk)), 5, h * n(pk));
      box(x, top, 5, h);
      line(x - 1, top + h * (1 - n(hold[i])), x + 6, top + h * (1 - n(hold[i])), INK, 1);
      t(i ? 'R' : 'L', x + 2.5, top + h + 7, 4.5, INK, 'center');
    });
    [0, -20, -40, -60].forEach(db => {
      const y = top + h * (-db / 60);
      line(283, y, 286, y);
      t(`${-db}`, 288, y + 1.6, 4.5);
    });
  }

  function lower() {
  // the row's right-hand readouts sit 12 further right, up to the band levels
  const R_DX = stack ? 0 : 12;

  // ── under the screen: the readout row ────────────────────────────────────
  const list: [string, boolean][] = [
    [`PGM ${f1(m.mom)} LUFS`, true],
    [`INT ${f1(m.integ)}`, false],
    [`TPL ${f1(m.tpL)} TPR ${f1(m.tpR)}`, true],
    [`PLR ${f1(m.plr)} PSR ${f1(m.psr)}`, true],
  ];
  list.forEach(([l, dash], i) => {
    const y = 414 + i * 10.6;
    if (dash) line(34, y - 2.5, 42, y - 2.5, INK, 1.2);
    t(l, 47, y, 7.5);
  });

  const tag = (label: string, x: number) => {
    const w = label.length * 4 + 9;
    box(x - w / 2, 406, w, 9.5);
    t(label, x, 413, 5.5, INK, 'center');
    line(x, 415.5, x, 452);
    line(x - 7, 424, x + 7, 424);
  };
  tag('LU-M', 176); tag('SPECT', 267); tag('MID/SIDE', 378 + R_DX);

  ['MOMENTARY', f1(m.mom), 'LUFS'].forEach((l, i) => t(l, 221, 433 + i * 8, 6.5, INK, 'center'));
  [
    `CREST ${f1(m.crest)} DB`,
    `CENTROID ${m.centroid >= 1000 ? `${(m.centroid / 1000).toFixed(2)}K` : f0(m.centroid)}`,
    `SLOPE ${f1(m.slope)} /OCT`,
  ].forEach((l, i) => t(l, 281, 433 + i * 8, 6.5));

  t(m.live ? (tp > -1 ? 'HOT' : 'ON AIR') : 'TEST SIGNAL', 390 + R_DX, 435, 8);
  line(390 + R_DX, 446, 402 + R_DX, 446); line(402 + R_DX, 442, 402 + R_DX, 450);
  dot(410 + R_DX, 446, 1.4);

  line(ROW ? 27 : 20, 462, stack ? 580 : 446 + R_DX, 462);   // stops short of the bit matrix

  // ── dot matrix: the third-octave spectrum, mirrored ──────────────────────
  const COLS = 18, X0 = 31, DX = 8.9;
  const colX = (c: number) => X0 + c * DX;
  ([['20', 20], ['80', 80], ['320', 320], ['1K2', 1250], ['5K', 5000], ['20K', 20000]] as [string, number][])
    .forEach(([l, f]) => t(l, colX((Math.log(f / 20) / Math.log(1000)) * (COLS - 1)), 474, 6.5, INK, 'center'));
  for (let c = 0; c < COLS; c++) {
    const f = 20 * Math.pow(1000, c / (COLS - 1));
    let b = 0;
    for (let k = 1; k < THIRD_OCTAVE.length; k++) {
      if (Math.abs(THIRD_OCTAVE[k] - f) < Math.abs(THIRD_OCTAVE[b] - f)) b = k;
    }
    const lit = clamp((m.bands[b] + 72) / 52, 0, 1) * 3;      // dots lit, of 3
    for (let r = 0; r < 3; r++) {
      const on = clamp(lit - r, 0, 1);                         // r = 0 hugs the label row
      const rad = 0.9 + on * 2.3;
      dot(colX(c), 504 - r * 10, rad);
      dot(colX(c), 529 + r * 10, rad);
    }
  }
  'LEVEL'.split('').forEach((ch, i) => t(ch, colX(i * 4.25), 519, 6.5, INK, 'center'));
  t('1/3', 27, 566, 6.5);
  'OCT'.split('').forEach((ch, i) => t(ch, colX(4.25 + i * 4.25), 566, 6.5, INK, 'center'));
  t('BAND', 189, 566, 6.5, INK, 'right');

  // ── middle column ────────────────────────────────────────────────────────
  line(195, 484, 425, 484);
  line(195, 480, 195, 488); line(425, 480, 425, 488);
  for (let i = 0; i < 5; i++) {
    const x = 218 + i * 46;
    dot(x, 484, 1.4 + 4 * clamp((m.gPeak[i] + 70) / 60, 0, 1));
    if (i < 4) { line(x + 23, 481, x + 23, 487); }
  }
  t('PEAK', 425, 497, 5, INK, 'right');
  t('HOLD', 425, 503, 5, INK, 'right');

  line(198, 503, 352, 503);
  t(`UPTIME ${f0(m.since)} S  FFT 8192`, 198, 512, 6.5);
  t(`BIN ${(m.sr / 8192).toFixed(1)} HZ  WINDOW 43 MS`, 198, 520, 6.5);
  line(198, 525, 352, 525);

  box(360 + R_DX, 511, 86, 18, INK, 1);
  t('TRUE-PEAK OVERS', 403 + R_DX, 518.5, 6.5, INK, 'center');
  t(`${m.overs} COUNTED.`, 403 + R_DX, 526, 6.5, INK, 'center');

  t(`HDRM ${f1(-1 - tp)}  TGT ${Number.isFinite(m.integ) ? f1(m.integ + 14) : '--.-'}`, 198, 539, 5.5);
  box(196, 545, 66, 22);
  t(`L ${f1(m.tpL)}`, 200, 553, 5.5);
  t(`R ${f1(m.tpR)}`, 200, 560, 5.5);
  dot(240, 551, 1.4); line(243, 551, 250, 551); dot(253, 551, 1.4);
  t('[DBTP]', 258, 564.5, 5, INK, 'right');

  // L and R, and the needle between them
  ctx.strokeStyle = INK; ctx.lineWidth = 0.8;
  for (const x of [283, 297]) { ctx.beginPath(); ctx.arc(x, 551, 4, 0, Math.PI * 2); ctx.stroke(); }
  line(287, 551, 293, 551);
  t('L', 283, 563, 4.5, INK, 'center'); t('R', 297, 563, 4.5, INK, 'center');
  line(309, 560, 329, 560);
  line(319, 560, 319 + 9 * clamp(m.corr, -1, 1), 547, INK, 1);
  t('CORR', 319, 567, 4.5, INK, 'center');

  t(`RMS ${f1(m.rms)}`, 344 + R_DX, 539, 5.5);
  t(`PK ${f1(Math.max(m.pkL, m.pkR))}`, 344 + R_DX, 546, 5.5);
  t(`SILENCE ${m.silence ? 'Y' : 'N'},`, 344 + R_DX, 556, 5.5);
  t(`OVERS ${m.overs}.`, 344 + R_DX, 563, 5.5);
  line(400 + R_DX, 535, 400 + R_DX, 570);
  t('ON SINCE', 408 + R_DX, 546, 5);
  t(`${f0(m.since)} S`, 408 + R_DX, 553, 5);
  t(`> ${m.live ? 'LIVE' : 'TEST'} <`, 408 + R_DX, 562, 5.5);

  // ── bit matrix: a row of band-level parity every ROW_MS ──────────────────
  const now = performance.now();
  if (now - lastRow >= ROW_MS) {
    lastRow = now;
    let row = 0;
    for (let c = 0; c < BIT_COLS; c++) row |= (Math.floor(Math.abs(m.bands[c]) * 3) & 1) << c;
    bitRows.unshift(row);
    bitRows.length = Math.min(bitRows.length, BIT_ROWS);
    // now and then one lit dot in the first 12 (both layouts show them) glows
    const lit = [...Array(12).keys()].filter(c => (row >> c) & 1);
    glowRows.unshift(lit.length && Math.random() < 0.08 ? 1 << lit[Math.floor(Math.random() * lit.length)] : 0);
    glowCols.unshift(GLOWS[Math.floor(Math.random() * GLOWS.length)]);
    glowRows.length = glowCols.length = bitRows.length;
  }
  // in the row it runs the full height, halved: a column of band levels on
  // the left, the newest 12 bands' bits on the right
  const [bitX, bitY, bitN, bitC] = stack ? [456, 472, 16, BIT_COLS] : [515, 408, BIT_ROWS, 12];
  if (!stack) {
    for (let i = 0; i < 12; i++) {
      const b = Math.round((i * (THIRD_OCTAVE.length - 1)) / 11);
      t(f1(m.bands[b]), 505, 412 + i * 12.4, 5.5, INK, 'right');
    }
  }
  bitRows.slice(0, bitN).forEach((row, r) => {
    for (let c = 0; c < bitC; c++) {
      if ((row >> c) & 1 && !((glowRows[r] >> c) & 1)) dot(bitX + c * 4.9, bitY + r * 4.9, 1.3);
    }
  });
  // the glow: a wide halo, the dot twice over it, then a hot core
  glowRows.slice(0, bitN).forEach((g, r) => {
    if (!g) return;
    const x = bitX + Math.log2(g) * 4.9, y = bitY + r * 4.9, c = glowCols[r];
    ctx.shadowColor = c;
    ctx.shadowBlur = 22 * s; dot(x, y, 1.3, c); dot(x, y, 1.3, c);
    ctx.shadowBlur = 6 * s; dot(x, y, 1.3, c);
    ctx.shadowBlur = 0; dot(x, y, 0.6, 'rgba(255,255,255,0.75)');
  });
  t(`LEVEL BITS, ${bitC} BANDS.`, 570, 558, 5.5, INK, 'right');
  t(`ONE ROW / ${ROW_MS} MS.`, 570, 566, 5.5, INK, 'right');
  }
}
