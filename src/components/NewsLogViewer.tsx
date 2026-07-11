'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { NewsPost } from '@/lib/types';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

// ── Theme system ──────────────────────────────────────────────────────
type Theme = {
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

const THEMES: Record<string, Theme> = {
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

const THEME_NAMES = ['default', 'eldar', 'monocai', 'night-owl', 'solarized-dark', 'solarized-light'];

// ── Helpers ───────────────────────────────────────────────────────────
function hexId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).slice(0, 4).toUpperCase().padStart(4, '0');
}

function bodyParagraphs(md: string): string[] {
  return md
    .split(/\n{2,}/)
    .map(p =>
      p.replace(/^#{1,6}\s+/, '')
       .replace(/\*\*(.*?)\*\*/g, '$1')
       .replace(/\*(.*?)\*/g, '$1')
       .replace(/^[-*]\s+/, '· ')
       .trim(),
    )
    .filter(p => p && p !== '---');
}

function fmtDate(d: Date): string {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const mos  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad  = (n: number) => String(n).padStart(2, '0');
  return `${days[d.getDay()]} ${mos[d.getMonth()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} UTC`;
}

// ── Log entry type ────────────────────────────────────────────────────
// cols[]: [src_host, src_port, dst_host, dst_port, proto_or_title]
type LogEntry = {
  id: string;
  ts: string;
  isReal: boolean;
  uid: string;
  cols: string[];
  post?: NewsPost;
};

// ── Static filler lines — columnar bro/zeek-style broadcast log ───────
const FILLER: LogEntry[] = [
  { id:'f-00', ts:'2026-01-10T08:23:14.001Z', isReal:false, uid:'Br8dF2mKtXp9nQ7aYz', cols:['vlg.fm.local','52001','broadcast.vlg.fm','80','udp'] },
  { id:'f-01', ts:'2026-01-10T08:23:14.119Z', isReal:false, uid:'Kx4hJ6pRsY3vL0mEqW', cols:['vlg.fm.local','52002','stream.vlg.fm','443','tcp'] },
  { id:'f-02', ts:'2026-01-10T08:23:14.225Z', isReal:false, uid:'Qw7cN1bZuT5fH8jSoP', cols:['99.0.88.77','52003','broadcast.vlg.fm','80','udp'] },
  { id:'f-03', ts:'2026-01-10T08:23:14.443Z', isReal:false, uid:'Lm2eR9nGiA6kD4sVjB', cols:['vlg.fm.local','52004','archive.vlg.fm','8080','tcp'] },
  { id:'f-04', ts:'2026-01-10T08:23:14.887Z', isReal:false, uid:'Yt5wO0pCxE3jM7vKhN', cols:['vlg.fm.local','52005','broadcast.vlg.fm','80','udp'] },
  { id:'f-05', ts:'2026-01-10T08:23:17.334Z', isReal:false, uid:'Fg1iU8qAbS2lP6nRcW', cols:['stream.vlg.fm','52006','cdn.vlg.fm','443','tcp'] },
  { id:'f-06', ts:'2026-01-10T08:23:20.001Z', isReal:false, uid:'Dh3oX4yJtV7wG9kZsE', cols:['99.0.88.77','52007','stream.vlg.fm','443','tcp'] },
  { id:'f-07', ts:'2026-01-10T08:23:23.445Z', isReal:false, uid:'Mn6rC2bFuI0eQ8pWlA', cols:['vlg.fm.local','52008','broadcast.vlg.fm','80','udp'] },
  { id:'f-08', ts:'2026-01-10T09:14:02.118Z', isReal:false, uid:'Tj9sK5xNvH1dL3mYqO', cols:['archive.vlg.fm','52009','cdn.vlg.fm','443','tcp'] },
  { id:'f-09', ts:'2026-01-10T09:14:05.334Z', isReal:false, uid:'Rz0wB7cDgP4fE6uIoS', cols:['vlg.fm.local','52010','stream.vlg.fm','443','tcp'] },
  { id:'f-10', ts:'2026-01-10T09:14:08.771Z', isReal:false, uid:'Av2yM8hXjT9bN5rQkU', cols:['broadcast.vlg.fm','52011','origin.vlg.fm','80','udp'] },
  { id:'f-11', ts:'2026-01-10T09:14:11.002Z', isReal:false, uid:'Wc4lG6nZpA1sO3vFdH', cols:['vlg.fm.local','52012','broadcast.vlg.fm','80','udp'] },
  { id:'f-12', ts:'2026-01-22T14:07:33.559Z', isReal:false, uid:'Xe8kR0mJqB5wT2uYnL', cols:['99.0.88.77','52013','broadcast.vlg.fm','80','udp'] },
  { id:'f-13', ts:'2026-01-22T14:07:33.774Z', isReal:false, uid:'Pi3fD7vCoW4lQ9sNgA', cols:['vlg.fm.local','52014','stream.vlg.fm','443','tcp'] },
  { id:'f-14', ts:'2026-01-22T14:07:36.002Z', isReal:false, uid:'Ub1cE5nHkS8mF0rZjX', cols:['stream.vlg.fm','52015','cdn.vlg.fm','443','tcp'] },
  { id:'f-15', ts:'2026-01-22T14:07:39.118Z', isReal:false, uid:'Gy6wI2oJtV9xN4bPeK', cols:['vlg.fm.local','52016','broadcast.vlg.fm','80','udp'] },
  { id:'f-16', ts:'2026-01-22T14:07:42.334Z', isReal:false, uid:'Sq7dL3hRuF1yM8cOvZ', cols:['archive.vlg.fm','52017','origin.vlg.fm','8080','tcp'] },
  { id:'f-17', ts:'2026-01-22T14:07:45.001Z', isReal:false, uid:'Nk0eA9wBxG6pT5sQmI', cols:['vlg.fm.local','52018','stream.vlg.fm','443','tcp'] },
  { id:'f-18', ts:'2026-02-01T19:55:02.441Z', isReal:false, uid:'Jv5nC8lYzO2rK7hWdF', cols:['99.0.88.77','52019','broadcast.vlg.fm','80','udp'] },
  { id:'f-19', ts:'2026-02-01T19:55:02.667Z', isReal:false, uid:'Ho4mU1bXpQ9fA6kNeS', cols:['vlg.fm.local','52020','stream.vlg.fm','443','tcp'] },
  { id:'f-20', ts:'2026-02-01T19:55:05.112Z', isReal:false, uid:'Zf7rT2cGvL5wI8jRoP', cols:['broadcast.vlg.fm','52021','cdn.vlg.fm','80','udp'] },
  { id:'f-21', ts:'2026-02-01T19:55:08.334Z', isReal:false, uid:'Ck3iW6nDsE0xM9bQgV', cols:['vlg.fm.local','52022','origin.vlg.fm','8080','tcp'] },
  { id:'f-22', ts:'2026-02-01T19:55:11.001Z', isReal:false, uid:'Ep1oS4hAjN7yF2mZuB', cols:['99.0.88.77','52023','broadcast.vlg.fm','80','udp'] },
  { id:'f-23', ts:'2026-02-07T11:30:19.228Z', isReal:false, uid:'Im8vK3gRdT6bO0cLwX', cols:['vlg.fm.local','52024','stream.vlg.fm','443','tcp'] },
  { id:'f-24', ts:'2026-02-07T11:30:19.445Z', isReal:false, uid:'Bl2wY7nPxA4eH9rSqJ', cols:['stream.vlg.fm','52025','cdn.vlg.fm','443','tcp'] },
  { id:'f-25', ts:'2026-02-07T11:30:22.118Z', isReal:false, uid:'Fo5jD0vGzN3mC8sWkU', cols:['vlg.fm.local','52026','broadcast.vlg.fm','80','udp'] },
  { id:'f-26', ts:'2026-02-07T11:30:25.334Z', isReal:false, uid:'Qa9rI6lBuK1fP7hToE', cols:['archive.vlg.fm','52027','origin.vlg.fm','8080','tcp'] },
  { id:'f-27', ts:'2026-02-12T22:14:47.001Z', isReal:false, uid:'Xt4kM8cNwF2bR5yOjA', cols:['vlg.fm.local','52028','stream.vlg.fm','443','tcp'] },
  { id:'f-28', ts:'2026-02-12T22:14:47.334Z', isReal:false, uid:'Gu7dQ3hSvP0nE9mZlI', cols:['broadcast.vlg.fm','52029','cdn.vlg.fm','80','udp'] },
  { id:'f-29', ts:'2026-02-12T22:14:50.778Z', isReal:false, uid:'Wr1oB5xCiG8jL4fKtN', cols:['vlg.fm.local','52030','broadcast.vlg.fm','80','udp'] },
];

function makeRealEntry(post: NewsPost): LogEntry {
  const ts = post.publishedAt ?? `${post.date}T12:00:00.000Z`;
  return {
    id: post.id, ts, isReal: true,
    uid: `REC_0x${hexId(post.id)}`,
    // cols: same 5-column layout — last col carries the title
    cols: ['vlg.fm.post', '443', 'transmission.vlg.fm', '*', post.title.toUpperCase()],
    post,
  };
}

function buildInitial(posts: NewsPost[]): LogEntry[] {
  const real = posts.map(makeRealEntry).sort((a, b) => a.ts.localeCompare(b.ts));
  return [...FILLER, ...real];
}

// ── Column widths (px) ────────────────────────────────────────────────
const CW = { ts: 178, uid: 148, c0: 108, c1: 50, c2: 118, c3: 36 }; // c4: flex-1

// ── Component ─────────────────────────────────────────────────────────
export function NewsLogViewer({ posts }: { posts: NewsPost[] }) {
  const [isDesktop, setIsDesktop]   = useState<boolean | null>(null);
  const [entries]                   = useState<LogEntry[]>(() => buildInitial(posts));
  const [selected, setSelected]     = useState<string | null>(null);
  const [theme, setTheme]           = useState('default');
  const [nowStr, setNowStr]         = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Clock — only in client to avoid hydration mismatch
  useEffect(() => {
    const tick = () => setNowStr(fmtDate(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }, []);

  if (isDesktop === null) return <div style={{ position:'fixed', inset:0, background:'#fff' }} />;

  const isMobile = !isDesktop;
  const T = THEMES[theme];
  const fs = isMobile ? 9 : 11;
  const lh = isMobile ? 13 : 14;
  // arrow: 32px on mobile, 40px on desktop; 12px from top; terminal starts below
  const arrowSize = isMobile ? 28 : 38;
  const arrowGap  = 10;
  const termTop   = arrowGap + arrowSize + arrowGap; // px from top of viewport

  // Desktop column layout — one flex row per entry
  function DesktopRow({ entry, isSelected }: { entry: LogEntry; isSelected: boolean }) {
    const uid_color = entry.isReal ? T.uid_real : T.uid_palette[parseInt(hexId(entry.uid), 16) % T.uid_palette.length];
    return (
      <div
        onClick={() => entry.isReal ? setSelected(s => s === entry.id ? null : entry.id) : undefined}
        style={{
          cursor: entry.isReal ? 'pointer' : 'default',
          background: isSelected ? T.sel_bg : 'transparent',
        }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = T.hover_bg; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* Single log line */}
        <div style={{ display:'flex', height:lh, overflow:'hidden', whiteSpace:'nowrap', alignItems:'baseline' }}>
          <span style={{ width:CW.ts,  flexShrink:0, color:T.ts,       marginRight:8 }}>{entry.ts}</span>
          <span style={{ width:CW.uid, flexShrink:0, color:uid_color,  marginRight:8 }}>{entry.uid}</span>
          <span style={{ width:CW.c0,  flexShrink:0, color: entry.isReal ? T.col_data : T.col_host, marginRight:8 }}>{entry.cols[0]}</span>
          <span style={{ width:CW.c1,  flexShrink:0, color: entry.isReal ? T.col_data : T.uid_palette[parseInt(hexId(entry.cols[1]), 16) % T.uid_palette.length], marginRight:8 }}>{entry.cols[1]}</span>
          <span style={{ width:CW.c2,  flexShrink:0, color: entry.isReal ? T.col_data : T.col_host, marginRight:8 }}>{entry.cols[2]}</span>
          <span style={{ width:CW.c3,  flexShrink:0, color:T.col_data, marginRight:8 }}>{entry.cols[3]}</span>
          <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', color: entry.isReal ? T.uid_real : T.col_data }}>
            {entry.cols[4]}
          </span>
        </div>

        {/* Expanded body — code-style */}
        {isSelected && entry.post && (
          <ExpandedBody entry={entry} T={T} lh={lh} />
        )}
      </div>
    );
  }

  // Mobile: compact — ts (short) + uid (truncated) + last col
  function MobileRow({ entry, isSelected }: { entry: LogEntry; isSelected: boolean }) {
    const uid_color = entry.isReal ? T.uid_real : T.uid_palette[parseInt(hexId(entry.uid), 16) % T.uid_palette.length];
    const tsShort = entry.ts.slice(11, 19) + 'Z'; // HH:MM:SSZ
    return (
      <div
        onClick={() => entry.isReal ? setSelected(s => s === entry.id ? null : entry.id) : undefined}
        style={{ cursor: entry.isReal ? 'pointer' : 'default', background: isSelected ? T.sel_bg : 'transparent' }}
      >
        <div style={{ display:'flex', height:lh, overflow:'hidden', whiteSpace:'nowrap', alignItems:'baseline' }}>
          <span style={{ flexShrink:0, color:T.ts,      marginRight:6, width:64 }}>{tsShort}</span>
          <span style={{ flexShrink:0, color:uid_color, marginRight:6, width:90, overflow:'hidden' }}>
            {entry.uid.slice(0, 12)}
          </span>
          <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', color: entry.isReal ? T.uid_real : T.col_data }}>
            {entry.cols[4]}
          </span>
        </div>
        {isSelected && entry.post && <ExpandedBody entry={entry} T={T} lh={lh} />}
      </div>
    );
  }

  const barH = 22;
  const filterH = 20;
  const tabH = 22;
  const cmdH = 22;

  return (
    <div style={{ position:'fixed', inset:0, background:T.bg, fontFamily:MONO, fontSize:fs, lineHeight:`${lh}px`, overflow:'hidden' }}>
      <div className="page-enter" style={{ position:'absolute', inset:0 }}>

        {/* Back arrow — above the terminal */}
        <Link href="/" style={{
          position:'absolute', left:arrowGap, top:arrowGap, zIndex:20,
          display:'block', width:arrowSize, height:arrowSize,
        }}>
          <Image
            src="/icons/left-arrow.png" alt="Back"
            width={arrowSize} height={arrowSize}
            style={{
              width:arrowSize, height:arrowSize, objectFit:'contain',
              // invert on dark themes
              filter: (theme === 'night-owl' || theme === 'solarized-dark') ? 'invert(1)' : 'none',
            }}
          />
        </Link>

        {/* Terminal — everything below the arrow */}
        <div style={{ position:'absolute', left:0, right:0, top:termTop, bottom:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* ── Top bar ── */}
          <div style={{
            height:barH, flexShrink:0,
            background:T.bar_bg, borderBottom:`1px solid ${T.bar_border}`,
            display:'flex', alignItems:'center', padding:`0 10px`,
            overflow:'hidden', whiteSpace:'nowrap', userSelect:'none', gap:0,
          }}>
            <span style={{ color:T.bar_dim, flexShrink:0 }}>{nowStr || '\u00a0'}</span>
            <span style={{ flex:1 }} />
            <span style={{ color:T.bar_dim, flexShrink:0 }}>logfile_vlg_transmission_log.0</span>
            <span style={{ color:T.bar_dim, flexShrink:0 }}>{' \u25c4\u25ba '}</span>
            <span style={{ flex:1 }} />
            <span style={{ color:T.bar_dim, flexShrink:0 }}>vlg_piper_log</span>
            <span style={{ color:T.bar_dim, flexShrink:0 }}>{'\u2003'}</span>
            <span style={{ color:T.bar_bright, flexShrink:0, fontWeight:'bold' }}>LOG</span>
          </div>

          {/* ── Log lines ── */}
          <div
            ref={logRef}
            style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:`2px 10px` }}
          >
            {entries.map(entry => {
              const isSelected = selected === entry.id;
              return isMobile
                ? <MobileRow key={entry.id} entry={entry} isSelected={isSelected} />
                : <DesktopRow key={entry.id} entry={entry} isSelected={isSelected} />;
            })}
          </div>

          {/* ── Filters bar ── */}
          <div style={{
            height:filterH, flexShrink:0,
            background:T.bar_bg, borderTop:`1px solid ${T.bar_border}`,
            display:'flex', alignItems:'center', padding:`0 10px`,
            overflow:'hidden', whiteSpace:'nowrap', userSelect:'none',
          }}>
            <span style={{ color:T.filter_col }}>Filters</span>
            <span style={{ color:T.bar_dim }}>{' ::'}</span>
            <span style={{ flex:1 }} />
            <span style={{ color:T.bar_bright }}>Press TAB to edit</span>
          </div>

          {/* ── Theme tabs ── */}
          <div style={{
            height:tabH, flexShrink:0,
            background:T.bar_bg, borderTop:`1px solid ${T.bar_border}`,
            display:'flex', alignItems:'stretch',
            overflow:'hidden', whiteSpace:'nowrap', userSelect:'none',
          }}>
            {THEME_NAMES.map(name => {
              const active = name === theme;
              return (
                <button
                  key={name}
                  onClick={() => setTheme(name)}
                  style={{
                    background: active ? T.tab_active_bg : T.tab_bg,
                    color: active ? T.tab_active_fg : T.tab_fg,
                    border: 'none', borderRight: `1px solid ${T.bar_border}`,
                    padding:'0 10px', cursor:'pointer',
                    fontFamily:MONO, fontSize:fs, lineHeight:`${lh}px`,
                    flexShrink:0,
                  }}
                >
                  {name}
                </button>
              );
            })}
            <div style={{ flex:1, background:T.tab_bg }} />
          </div>

          {/* ── Command line ── */}
          <div style={{
            height:cmdH, flexShrink:0,
            background:T.cmd_bg, borderTop:`1px solid ${T.bar_border}`,
            display:'flex', alignItems:'center', padding:`0 10px`,
            overflow:'hidden', whiteSpace:'nowrap',
          }}>
            <span style={{ color:T.cmd_fg }}>{`/config /ui/theme ${theme}`}</span>
            <span style={{
              display:'inline-block', width:7, height:lh-2,
              background:T.cmd_cursor, verticalAlign:'-1px', marginLeft:1,
              animation:'vr-blink 1s step-end infinite',
            }} />
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Expanded code-style body panel ────────────────────────────────────
function ExpandedBody({ entry, T, lh }: { entry: LogEntry; T: Theme; lh: number }) {
  if (!entry.post) return null;
  const paras = bodyParagraphs(entry.post.body);
  const sep = '// ' + '─'.repeat(56);
  return (
    <div style={{
      margin:`4px 0 ${lh}px 0`,
      borderTop:`1px solid ${T.exp_border}`,
      paddingTop:6,
    }}>
      <div style={{ color:T.exp_comment }}>{`// ${entry.uid}  ·  ts=${entry.ts}  ·  status=PUBLISHED`}</div>
      <div style={{ color:T.exp_comment }}>{sep}</div>
      {paras.map((para, i) => (
        <div key={i} style={{ display:'flex', marginTop:3, alignItems:'baseline' }}>
          <span style={{ color:T.exp_num, flexShrink:0, width:36, userSelect:'none' }}>
            {String(i + 1).padStart(3, '0')}{'  '}
          </span>
          <span style={{ color:T.exp_text, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{para}</span>
        </div>
      ))}
      <div style={{ color:T.exp_comment, marginTop:3 }}>{sep}</div>
      <div style={{ color:T.exp_comment }}>{'// end_record'}</div>
    </div>
  );
}
