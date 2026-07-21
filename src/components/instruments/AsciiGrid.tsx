'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { LIGHT_THEMES } from '@/lib/theme';

/** Tone ramp for density/magnitude → glyph. Index by normalized 0..1 value. */
export const RAMP = ' .·:-=+*#%@';

export type Grid = { cols: number; rows: number; cells: string[] };

export function makeGrid(cols: number, rows: number): Grid {
  return { cols, rows, cells: new Array(Math.max(0, cols * rows)).fill(' ') };
}

export function plot(g: Grid, col: number, row: number, ch: string) {
  const c = Math.round(col), r = Math.round(row);
  if (c < 0 || c >= g.cols || r < 0 || r >= g.rows) return;
  g.cells[r * g.cols + c] = ch;
}

export function hline(g: Grid, row: number, col0: number, col1: number, ch: string) {
  const lo = Math.min(col0, col1), hi = Math.max(col0, col1);
  for (let c = lo; c <= hi; c++) plot(g, c, row, ch);
}

export function vline(g: Grid, col: number, row0: number, row1: number, ch: string) {
  const lo = Math.min(row0, row1), hi = Math.max(row0, row1);
  for (let r = lo; r <= hi; r++) plot(g, col, r, ch);
}

/** Per-glyph override for a box; omit any field to keep the ASCII default. */
export type BoxChars = { h?: string; v?: string; tl?: string; tr?: string; bl?: string; br?: string };

/**
 * Frame. Defaults to `+ - |` ASCII. Pass box-drawing glyphs (`┌─┐│└┘`) for a
 * frame that actually *closes*: unlike `-` (which draws mid-cell, leaving a gap
 * above the top edge) box-drawing glyphs fill the full cell and tile with the
 * vertical edges, so every corner reads connected — provided the `<pre>`'s
 * line-height equals its font-size (see AsciiGrid).
 */
export function box(g: Grid, col0: number, row0: number, col1: number, row1: number, chars: BoxChars = {}) {
  const { h = '-', v = '|', tl = '+', tr = '+', bl = '+', br = '+' } = chars;
  hline(g, row0, col0, col1, h);
  hline(g, row1, col0, col1, h);
  vline(g, col0, row0, row1, v);
  vline(g, col1, row0, row1, v);
  plot(g, col0, row0, tl);
  plot(g, col1, row0, tr);
  plot(g, col0, row1, bl);
  plot(g, col1, row1, br);
}

export function text(g: Grid, col: number, row: number, str: string) {
  for (let i = 0; i < str.length; i++) plot(g, col + i, row, str[i]);
}

export function toString(g: Grid): string {
  const lines: string[] = [];
  for (let r = 0; r < g.rows; r++) {
    lines.push(g.cells.slice(r * g.cols, (r + 1) * g.cols).join(''));
  }
  return lines.join('\n');
}

/** Self-check for the grid helpers — run via `npx tsx` or import in a test. */
export function demo(): void {
  const g = makeGrid(3, 3);
  box(g, 0, 0, 2, 2);
  plot(g, 1, 1, '@');
  const out = toString(g);
  const expected = '+-+\n|@|\n+-+';
  console.assert(out === expected, `AsciiGrid.demo mismatch:\n${out}\n---\n${expected}`);
}

// Font metrics. line-height == font-size is deliberate: box-drawing verticals
// (│) only tile into an unbroken edge when the line box equals the em, so the
// frame closes. IBM Plex Mono advance ≈ 0.6em.
const FONT_PX = 13;
const CHAR_W = FONT_PX * 0.6;
const LINE_H = FONT_PX;

/** A cell is taller than wide; multiply row-extents by this to draw round. */
export const CELL_ASPECT = CHAR_W / LINE_H;

export function AsciiGrid({
  draw,
  className,
  style,
}: {
  draw: (g: Grid, cols: number, rows: number, t: number) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const dimsRef = useRef({ cols: 0, rows: 0 });
  const rafRef = useRef(0);
  const { name: theme } = useTheme();
  const light = LIGHT_THEMES.has(theme);

  useEffect(() => {
    const el = preRef.current; if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      dimsRef.current = {
        cols: Math.max(1, Math.floor(width / CHAR_W)),
        rows: Math.max(1, Math.floor(height / LINE_H)),
      };
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loop = useCallback(() => {
    const el = preRef.current;
    const { cols, rows } = dimsRef.current;
    if (el && cols > 0 && rows > 0) {
      const g = makeGrid(cols, rows);
      draw(g, cols, rows, performance.now() * 0.001);
      el.textContent = toString(g);
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [draw]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  return (
    <pre
      ref={preRef}
      className={className}
      style={{
        margin: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        whiteSpace: 'pre',
        fontFamily: "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace",
        fontSize: FONT_PX,
        lineHeight: `${LINE_H}px`,
        letterSpacing: 0,
        color: light ? '#000' : '#fff',
        ...style,
      }}
    />
  );
}
