'use client';

import { Airspace } from '@/components/Airspace';
import { RadarScope } from '@/components/RadarScope';
import { Teleprinter } from '@/components/Teleprinter';
import type { Live } from '@/lib/live';
import { useEffect, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the global command prompt's strip, as on the station
const POLL = 15000;       // the console's state from /api/radar/live; the instruments take it live
const ROW_W = 260 + 372 + 260, ROW_H = 446;   // the three plates side by side, plate units
const GAP = 0;            // between them, px

/** The radar console: teleprinter | radar | airspace in a row above the
 *  prompt; on phones a scrolling column, the roll last. README where the station keeps its own. */
export function RadarDesktop({ initial }: { initial: Live }) {
  const [live, setLive] = useState(initial);
  useEffect(() => {
    let alive = true;
    const poll = () => fetch('/api/radar/live', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then((j: Live | null) => { if (alive && j) setLive(j); }).catch(() => {});
    const iv = setInterval(poll, POLL);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  const { feed, telex, net, fires, incidents, alerts } = live;

  return (
    <div className="console" style={{ background: 'var(--vlg-bg, #fff)' }}>
      <style>{`
        /* phones: an ordinary page, so scrolling it also tucks Safari's address bar away. The clock
           bar and README sit at the very top of it and the prompt at the very end, and scroll away
           with it, rather than staying pinned over the instruments. */
        .console { display: flex; flex-direction: column; align-items: center; gap: 12px;
                   padding: 64px 8px ${PROMPT_BAND + 8}px; }
        @media (max-width: 899px) {
          body { position: relative; }   /* what the bars below are placed against: the whole page */
          .station-bar, .radar-back { position: absolute !important; }
          .cmd-prompt { position: absolute !important; }
        }
        .console .plate { display: block; position: relative; width: min(100%, 480px); flex: none; }
        .console .plate canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
        .console .pane, .console .reg { display: none; position: absolute; }
        .console .reg { width: 15px; height: 15px; transform: translate(-50%, -50%); pointer-events: none;
          background: linear-gradient(#000, #000) center / 100% 1px no-repeat, linear-gradient(#000, #000) center / 1px 100% no-repeat; }
        /* a survey drawing: white paper, the photo's asphalt as the ground under the instruments, black
           hairlines that run on past it, registration marks where they cross */
        html[data-theme="default"]:has(.console) { background: #fff; --vlg-fg: #000 !important; --vlg-cmd-cursor: #000 !important; }
        html[data-theme="default"] body:has(.console)::before { display: none; }
        html[data-theme="default"] .console { overflow: clip; }
        html[data-theme="default"] .console .plate::after { content: ''; position: absolute; top: -100vh; bottom: -100vh; left: 0; right: 0; pointer-events: none;
          border: solid rgba(0,0,0,0.28); border-width: 0 1px; }
        html[data-theme="default"] .console .pane { display: block; border: 1px solid #000; }
        html[data-theme="default"] .console .pane:not(.round)::after { content: ''; position: absolute; top: 0; bottom: 0; left: -100vw; right: -100vw; pointer-events: none;
          border: solid rgba(0,0,0,0.28); border-width: 1px 0; }
        html[data-theme="default"] .console .pane.round::after { content: ''; position: absolute; inset: -14%; border-radius: 50%; border: 1px solid rgba(0,0,0,0.3); pointer-events: none; }
        html[data-theme="default"] .console .reg { display: block; }
        html[data-theme="default"] .console .radar { isolation: isolate; }
        html[data-theme="default"] .console .radar::before { content: ''; position: absolute; z-index: -1; left: 0; top: 8.5%; width: 100vw; height: 70%; pointer-events: none;
          background: url(/site_assets/landing_solo.webp) -1056px -950px / 2600px auto no-repeat; filter: grayscale(1) brightness(2.2) contrast(0.6) brightness(1.1) blur(0.5px);
          clip-path: polygon(0 5%, 14% 5%, 14% 0, 66% 0, 66% 8%, 100% 8%, 100% 100%, 62% 100%, 62% 95%, 34% 95%, 34% 100%, 0 100%); }
        .console .radar, .console .air { order: -1; }   /* phones: the roll last */
        @media (min-width: 900px) {
          .console { position: fixed; inset: 0 0 ${PROMPT_BAND}px 0; flex-direction: row; justify-content: center; gap: ${GAP}px; padding: 0; overflow: hidden; }
          .console .plate { width: auto; height: min(calc(100dvh - 140px), calc((100vw - 48px - ${2 * GAP}px) * ${ROW_H} / ${ROW_W}), 720px); }
          .console .radar, .console .air { order: 0; }
        }
      `}</style>
      <Teleprinter lines={telex} net={net} />
      <RadarScope feed={feed} fires={fires} incidents={incidents} alerts={alerts} />
      <Airspace />
      {/* README where the station keeps its own; a placeholder for now, it leads nowhere */}
      <a className="radar-back" style={{
        position: 'fixed', top: 24, right: 24, zIndex: 5,
        fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em',
        color: 'var(--vlg-fg, #000)', textDecoration: 'none', cursor: 'default',
      }}>
        README
      </a>
    </div>
  );
}
