'use client';

import { Airspace } from '@/components/Airspace';
import { BackLink } from '@/components/BackLink';
import { RadarScope } from '@/components/RadarScope';
import { SettlementMap } from '@/components/SettlementMap';
import { Teleprinter } from '@/components/Teleprinter';
import type { Live } from '@/lib/live';
import { useEffect, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the global command prompt's strip, as on the station
const POLL = 15000;       // the console's state from /api/radar/live; the instruments take it live
const ROW_W = 260 + 372 + 260 + 260, ROW_H = 446;   // the four plates side by side, plate units

/** The radar console: teleprinter | radar | settlement map | airspace in a row above the
 *  prompt; on phones a scrolling column, the roll last. BACK where the station keeps README. */
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
        .console { position: fixed; inset: 0 0 ${PROMPT_BAND}px 0; display: flex; flex-direction: column; align-items: center; gap: 12px;
                   padding: 64px 8px 24px; overflow-y: auto; overscroll-behavior: contain; }
        /* phones: the clock bar's ground, so the column scrolls under solid stock */
        .console-band { position: fixed; top: 0; left: 0; right: 0; height: 56px; background: var(--vlg-bg, #fff); z-index: 4; }
        .console .plate { display: block; width: min(100%, 480px); flex: none; }
        .console .radar, .console .map, .console .air { order: -1; }   /* phones: the roll last */
        @media (min-width: 900px) {
          .console { flex-direction: row; justify-content: center; gap: 0; padding: 0; overflow: hidden; }
          .console .plate { width: auto; height: min(calc(100dvh - 140px), calc((100vw - 48px) * ${ROW_H} / ${ROW_W}), 720px); }
          .console .radar, .console .map, .console .air { order: 0; }
          .console-band { display: none; }
        }
      `}</style>
      <div className="console-band" aria-hidden />
      <Teleprinter lines={telex} net={net} />
      <RadarScope feed={feed} fires={fires} incidents={incidents} alerts={alerts} />
      <SettlementMap />
      <Airspace />
      <BackLink href="/station" style={{
        position: 'fixed', top: 24, right: 24, zIndex: 5,
        fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em',
        color: 'var(--vlg-fg, #000)', textDecoration: 'none',
      }}>
        BACK
      </BackLink>
    </div>
  );
}
