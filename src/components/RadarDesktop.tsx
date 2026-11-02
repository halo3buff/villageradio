'use client';

import { Airspace } from '@/components/Airspace';
import { RadarScope } from '@/components/RadarScope';
import { SettlementMap } from '@/components/SettlementMap';
import { Teleprinter } from '@/components/Teleprinter';
import type { Live } from '@/lib/live';
import { useEffect, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the global command prompt's strip, as on the station
const POLL = 15000;       // the console's state from /api/radar/live; the instruments take it live
const ROW_W = 260 + 372 + 260 + 260, ROW_H = 446;   // the four plates side by side, plate units
const GAP = 8;            // between them, px

/** The radar console: teleprinter | radar | settlement map | airspace in a row above the
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
        .console .pane { display: none; position: absolute; }
        /* the station's plate and window: a white outline on the photo, frosted on a layer of its own
           (a backdrop-filter on the plate would cut the panes' blur off from the page). Smokier than
           the station's: this much small type needs the ground, and the photo's grain gone from under it */
        html[data-theme="default"] .console .plate { isolation: isolate; border: 1px solid #fff; box-shadow: 0 0 3px rgba(255,255,255,0.3); }
        html[data-theme="default"] .console .plate::before { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(0,0,0,0.22); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
        html[data-theme="default"] .console .pane { display: block; border: 1px solid #fff; box-shadow: 0 0 3px rgba(255,255,255,0.3);
          background: rgba(0,0,0,0.22); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
        .console .radar, .console .map, .console .air { order: -1; }   /* phones: the roll last */
        @media (min-width: 900px) {
          .console { position: fixed; inset: 0 0 ${PROMPT_BAND}px 0; flex-direction: row; justify-content: center; gap: ${GAP}px; padding: 0; overflow: hidden; }
          .console .plate { width: auto; height: min(calc(100dvh - 140px), calc((100vw - 48px - ${3 * GAP}px) * ${ROW_H} / ${ROW_W}), 720px); }
          .console .radar, .console .map, .console .air { order: 0; }
        }
      `}</style>
      <Teleprinter lines={telex} net={net} />
      <RadarScope feed={feed} fires={fires} incidents={incidents} alerts={alerts} />
      <SettlementMap />
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
