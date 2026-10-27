'use client';

import { Airspace } from '@/components/Airspace';
import { BackLink } from '@/components/BackLink';
import { RadarScope } from '@/components/RadarScope';
import { SettlementMap } from '@/components/SettlementMap';
import { Teleprinter } from '@/components/Teleprinter';
import type { Fire } from '@/lib/fires';
import type { NetNow, RadarFeed, TelexLine } from '@/lib/radar';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the global command prompt's strip, as on the station
const REFRESH = 60000;    // re-fetch the reports and outages in place; the instruments take them live
const ROW_W = 260 + 372 + 260 + 260, ROW_H = 446;   // the four plates side by side, plate units

/** The radar console: teleprinter | radar | settlement map | airspace in a row above the
 *  prompt; on phones a scrolling column, the roll last. BACK where the station keeps README. */
export function RadarDesktop({ feed, telex, net, fires }: { feed: RadarFeed | null; telex: TelexLine[]; net: NetNow | null; fires: Fire[] | null }) {
  const router = useRouter();
  useEffect(() => {
    const iv = setInterval(() => router.refresh(), REFRESH);
    return () => clearInterval(iv);
  }, [router]);

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
      <RadarScope feed={feed} fires={fires} />
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
