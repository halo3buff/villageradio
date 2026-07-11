// ── Site-wide theme system ──────────────────────────────────────────────
// Admin-selectable palette (Admin → Settings) applied to the shared site
// chrome (nav/player/ticker/body) and the news log viewer, via CSS custom
// properties injected by the root layout. See src/app/layout.tsx and
// src/components/ThemeProvider.tsx.

export type Theme = {
  bg: string;
  ts: string;          // timestamp column
  uid_palette: string[]; // cols 2 & 4 — cycles per unique value (like lnav field coloring)
  uid_real: string;    // UID column — real news entries (highlighted)
  col_host: string;    // cols 3 & 5 — consistent pinkish/accent (src host, dst host)
  col_data: string;    // cols 6+ — default data text
  bar_bg: string;
  bar_border: string;
  bar_dim: string;     // dim bar text
  bar_bright: string;  // bright bar text / LOG badge
  filter_col: string;
  tab_bg: string;
  tab_fg: string;
  tab_active_bg: string;
  tab_active_fg: string;
  cmd_bg: string;
  cmd_fg: string;
  cmd_cursor: string;
  hover_bg: string;
  sel_bg: string;
  exp_comment: string; // // comment lines in expanded body
  exp_num: string;     // line numbers in expanded body
  exp_text: string;    // body paragraph text
  exp_border: string;
};

export const THEMES: Record<string, Theme> = {
  default: {
    bg:'#ffffff', ts:'#888888', uid_palette:['#008880','#208820','#8020a0','#1860c0','#a04000','#006090','#6a1a6a','#0a7a50','#8a3000','#2040a0'], uid_real:'#111111', col_host:'#b05870', col_data:'#666666',
    bar_bg:'#f2f2f2', bar_border:'#d8d8d8', bar_dim:'#aaaaaa', bar_bright:'#111111',
    filter_col:'#666666',
    tab_bg:'#e8e8e8', tab_fg:'#888888', tab_active_bg:'#222222', tab_active_fg:'#ffffff',
    cmd_bg:'#e0e0e0', cmd_fg:'#222222', cmd_cursor:'#222222',
    hover_bg:'rgba(0,0,0,0.03)', sel_bg:'rgba(0,0,0,0.06)',
    exp_comment:'#aaaaaa', exp_num:'#cccccc', exp_text:'#222222', exp_border:'#e0e0e0',
  },
  eldar: {
    bg:'#ffffff', ts:'#b58a00', uid_palette:['#2a8c78','#3a70c0','#8040b0','#1a9040'], uid_real:'#9010a0', col_host:'#b04060', col_data:'#555544',
    bar_bg:'#f5f2e8', bar_border:'#ddd8c0', bar_dim:'#998868', bar_bright:'#b58a00',
    filter_col:'#2a8c78',
    tab_bg:'#ede8d8', tab_fg:'#998860', tab_active_bg:'#2a8c78', tab_active_fg:'#ffffff',
    cmd_bg:'#e8e2c0', cmd_fg:'#1a1a1a', cmd_cursor:'#b58a00',
    hover_bg:'rgba(181,138,0,0.05)', sel_bg:'rgba(42,140,120,0.09)',
    exp_comment:'#2a8c78', exp_num:'#c8b870', exp_text:'#1a1a1a', exp_border:'#ddd8c0',
  },
  monocai: {
    bg:'#ffffff', ts:'#b87200', uid_palette:['#4e8a00','#1a7a9a','#8a5000','#007a60'], uid_real:'#c00058', col_host:'#b82858', col_data:'#555548',
    bar_bg:'#f5f5ee', bar_border:'#e0e0d4', bar_dim:'#9a9a88', bar_bright:'#b87200',
    filter_col:'#4e8a00',
    tab_bg:'#eceae0', tab_fg:'#8a8070', tab_active_bg:'#c00058', tab_active_fg:'#ffffff',
    cmd_bg:'#e5e2d0', cmd_fg:'#1a1a1a', cmd_cursor:'#b87200',
    hover_bg:'rgba(184,114,0,0.05)', sel_bg:'rgba(192,0,88,0.07)',
    exp_comment:'#4e8a00', exp_num:'#c8c098', exp_text:'#1a1a1a', exp_border:'#e0e0d4',
  },
  'night-owl': {
    bg:'#011627', ts:'#addb67', uid_palette:['#7fdbca','#82aaff','#c792ea','#addb67'], uid_real:'#ff5874', col_host:'#f78c6c', col_data:'#c8d4e0',
    bar_bg:'#01111d', bar_border:'#1a3348', bar_dim:'#4a6880', bar_bright:'#addb67',
    filter_col:'#7fdbca',
    tab_bg:'#01111d', tab_fg:'#506070', tab_active_bg:'#7fdbca', tab_active_fg:'#011627',
    cmd_bg:'#01111d', cmd_fg:'#d6deeb', cmd_cursor:'#addb67',
    hover_bg:'rgba(127,219,202,0.07)', sel_bg:'rgba(255,88,116,0.12)',
    exp_comment:'#7fdbca', exp_num:'#4a6880', exp_text:'#d6deeb', exp_border:'#1a3348',
  },
  'solarized-dark': {
    bg:'#002b36', ts:'#b58900', uid_palette:['#2aa198','#268bd2','#859900','#6c71c4'], uid_real:'#d33682', col_host:'#dc322f', col_data:'#93a1a1',
    bar_bg:'#073642', bar_border:'#0a4055', bar_dim:'#586e75', bar_bright:'#b58900',
    filter_col:'#2aa198',
    tab_bg:'#073642', tab_fg:'#586e75', tab_active_bg:'#2aa198', tab_active_fg:'#002b36',
    cmd_bg:'#073642', cmd_fg:'#839496', cmd_cursor:'#b58900',
    hover_bg:'rgba(42,161,152,0.08)', sel_bg:'rgba(211,54,130,0.12)',
    exp_comment:'#2aa198', exp_num:'#586e75', exp_text:'#93a1a1', exp_border:'#0a4055',
  },
  'solarized-light': {
    bg:'#fdf6e3', ts:'#b58900', uid_palette:['#2aa198','#268bd2','#859900','#6c71c4'], uid_real:'#d33682', col_host:'#dc322f', col_data:'#586e75',
    bar_bg:'#eee8d5', bar_border:'#d8d0b8', bar_dim:'#93a1a1', bar_bright:'#b58900',
    filter_col:'#2aa198',
    tab_bg:'#eee8d5', tab_fg:'#93a1a1', tab_active_bg:'#2aa198', tab_active_fg:'#fdf6e3',
    cmd_bg:'#e8e2cc', cmd_fg:'#657b83', cmd_cursor:'#b58900',
    hover_bg:'rgba(42,161,152,0.06)', sel_bg:'rgba(211,54,130,0.08)',
    exp_comment:'#2aa198', exp_num:'#b8bea8', exp_text:'#586e75', exp_border:'#d8d0b8',
  },
};

// Full palette set (used internally, e.g. by the news log). Admin only exposes a subset — see
// THEME_NAMES below — the rest stay defined so re-enabling one later is a one-line change.
export const ALL_THEME_NAMES = ['default', 'eldar', 'monocai', 'night-owl', 'solarized-dark', 'solarized-light'];

// Admin-selectable site-wide themes. Trimmed to 2 for now at the user's request.
export const THEME_NAMES = ['default', 'solarized-dark'];

export const DEFAULT_THEME = 'default';

export const LIGHT_THEMES = new Set(['default', 'eldar', 'monocai', 'solarized-light']);

export function isThemeName(name: string): boolean {
  return THEME_NAMES.includes(name);
}

/** CSS custom properties for the shared site chrome — a subset of Theme's tokens. */
export function siteCssVars(name: string): string {
  const t = THEMES[name] ?? THEMES[DEFAULT_THEME];
  const invert = LIGHT_THEMES.has(name) ? 0 : 1;
  return `:root{--vlg-bg:${t.bg};--vlg-fg:${t.exp_text};--vlg-fg-dim:${t.bar_dim};--vlg-border:${t.bar_border};--vlg-accent:${t.uid_real};--vlg-panel:${t.bar_bg};--vlg-invert:${invert};}`;
}
