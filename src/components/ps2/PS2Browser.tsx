'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NavCommand } from '@/lib/types';
import { grantClearance } from '@/lib/clearance';
import { render, type Tri } from './mesh';
import { MODELS, fallbackModel } from './models';
import { PS2_BG, ps2Font } from './PS2Bar';

interface Item { route: string; title: [string, string]; tris: Tri[] }

/** The landing page as the PS2's memory-card browser: a grid of spinning icons, one per page. */
export function PS2Browser({ commands }: { commands: NavCommand[] }) {
  const router = useRouter();
  // the same list the README shows (blocked/hidden stay off), README itself first
  const items = useMemo<Item[]>(() => {
    const list = [{ route: '/information', label: 'readme' },
      ...commands.filter((c) => !c.blocked && !c.hidden && c.route !== '/information')];
    return list.map(({ route, label }) => {
      const m = MODELS[route] ?? fallbackModel(label);
      const tris: Tri[] = []; m.build(tris);
      return { route, title: m.title, tris };
    });
  }, [commands]);
  const [sel, setSel] = useState(0);

  const enter = (i: number) => { const r = items[i]?.route; if (!r) return; grantClearance(r); router.push(r); };

  // arrows walk the grid, Enter opens; never swallow keys (SootSprite listens for its own sequence)
  useEffect(() => {
    const cols = 3;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (d) setSel((s) => Math.min(items.length - 1, Math.max(0, s + d)));
      else if (e.key === 'Enter') enter(sel);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // ✕ Enter in the legend opens whatever is selected
  useEffect(() => {
    const on = () => enter(sel);
    window.addEventListener('ps2:enter', on);
    return () => window.removeEventListener('ps2:enter', on);
  });

  useEffect(() => {
    const body = document.body, prev = body.style.minHeight;
    body.style.minHeight = '0';
    return () => { body.style.minHeight = prev; };
  }, []);

  const title = items[sel]?.title ?? ['', ''];

  return (
    <main className={`ps2 ${ps2Font.className}`} style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: PS2_BG }}>
      <style>{`
        .ps2-head { position: absolute; top: 5vh; left: 4vw; display: flex; gap: 1.6vw; align-items: flex-start; }
        .ps2-sel.ps2-text { color: #fff23a; }
        .ps2-card { width: clamp(28px, 4.2vw, 56px); aspect-ratio: 1; background: #141416; border: 2px solid #444;
          box-shadow: 0 2px 4px rgba(0,0,0,0.4); margin-top: 0.3em; }
        .ps2-h1 { font-size: clamp(22px, 3.6vw, 52px); line-height: 1.02; }
        .ps2-h2 { font-size: clamp(17px, 2.6vw, 38px); line-height: 1.1; }
        .ps2-sel { position: absolute; top: 5vh; right: 3vw; text-align: right;
          font-size: clamp(18px, 3.3vw, 48px); line-height: 1.08; }
        .ps2-grid { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%) perspective(900px) rotateX(12deg);
          display: grid; grid-template-columns: repeat(3, auto); gap: clamp(8px, 3vh, 36px) clamp(14px, 6vw, 90px); }
        .ps2-icon { all: unset; position: relative; cursor: pointer; width: clamp(104px, 15vw, 200px); aspect-ratio: 1; display: block; }
        .ps2-icon canvas { position: relative; width: 100%; height: 100%; display: block; }
        .ps2-glow { position: absolute; inset: -45%; pointer-events: none; opacity: 0; transition: opacity 0.25s;
          background: radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(240,242,255,0.55) 28%, rgba(255,255,255,0) 62%); }
        .ps2-icon[data-sel="1"] .ps2-glow { opacity: 1; }
        @media (max-width: 715px) {
          .ps2-head { top: calc(env(safe-area-inset-top, 0px) + 22px); left: 16px; gap: 10px; }
          .ps2-sel { top: auto; bottom: calc(env(safe-area-inset-bottom, 0px) + 92px); right: 16px; }
          .ps2-grid { top: 47%; }
        }
      `}</style>

      <div className="ps2-head">
        <div className="ps2-card" />
        <div className="ps2-text">
          <div className="ps2-h1">Village Radio (VLG)/1</div>
          <div className="ps2-h2">{items.length} Channels</div>
        </div>
      </div>
      <div className="ps2-sel ps2-text">
        <div>{title[0]}</div><div>{title[1]}</div>
      </div>

      <div className="ps2-grid">
        {items.map((it, i) => (
          <button key={it.route} className="ps2-icon" data-sel={i === sel ? 1 : 0} aria-label={it.title[0]}
            onMouseEnter={() => setSel(i)}
            onClick={() => (i === sel ? enter(i) : setSel(i))}>
            <span className="ps2-glow" />
            <Spinner tris={it.tris} spinning={i === sel} />
          </button>
        ))}
      </div>
    </main>
  );
}

// The selected icon turns; the rest hold a three-quarter pose, as the console's did.
function Spinner({ tris, spinning }: { tris: Tri[]; spinning: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const yaw = useRef(-0.5);
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    // 1x backing on purpose: the browser's upscale gives the console's soft edge
    const size = c.clientWidth || 120;
    c.width = c.height = size;
    if (!spinning) yaw.current = -0.5;
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      if (spinning) yaw.current += ((now - last) / 1000) * 1.4;
      last = now;
      render(ctx, tris, size, yaw.current);
      if (spinning) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tris, spinning]);
  return <canvas ref={ref} />;
}
