'use client';

import Link from 'next/link';
import { AnalogueStrip, type Metrics } from '@/components/AnalogueStrip';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const INK = 'var(--vlg-fg, #111)';
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const DESKTOP = '#0160ac';   // the station's blue (kept from the Sapporo '72 trial)
const WHITE = '#fbfcfe';

const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '--.-');

type Read = { mom: number; integ: number; tp: number; corr: number; live: boolean };

/**
 * The station as a spec label in the top-left corner: the white Lissajous square, a spine with
 * ON AIR / TEST, then the clock, what's playing and the loudness. README and RADAR top-right;
 * the prompt is global (see SiteFrame), the transport the StationBar.
 */
export function HomeDesktop() {
  const { currentTrack } = useAudio();
  const [clock, setClock] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const latest = useRef<Metrics | null>(null);

  // the body's min-h-screen is iOS's LARGE viewport, taller than what's visible with the URL bar
  // up: drop it while the station is up, so the page has nothing to scroll (as HomeTemp does)
  useEffect(() => {
    const body = document.body;
    const prev = [body.style.minHeight, body.style.background];
    body.style.minHeight = '0';
    // the page's ink goes white on the blue, the global prompt and the StationBar with it
    body.style.background = DESKTOP;
    body.style.setProperty('--vlg-fg', '#fbfcfe');
    return () => {
      [body.style.minHeight, body.style.background] = prev;
      body.style.removeProperty('--vlg-fg');
    };
  }, []);

  // the clock and the readout four times a second, the readout off the scope's latest frame
  useEffect(() => {
    const tick = () => {
      setClock(stationClock());
      const m = latest.current;
      if (m) setRead({ mom: m.mom, integ: m.integ, tp: Math.max(m.tpL, m.tpR), corr: m.corr, live: m.live });
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, []);

  const r = read;
  const corr = r?.corr ?? NaN;
  const width = Number.isFinite(corr) ? Math.round((1 - corr) * 50) : '--';
  const status = r?.live ? (r.tp > -1 ? 'HOT' : 'ON AIR') : 'TEST';
  const track = currentTrack;

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', inset: 0, paddingBottom: PROMPT_BAND,   // the blue under the prompt too
      overflow: 'hidden', overscrollBehavior: 'contain',
      fontFamily: MONO, color: INK, background: DESKTOP,
    }}>
      <style>{`
        /* a label, as on a rack's spec plate: the scope, a spine with the status set sideways,
           then the clock over a dotted rule and three lines; one white outline round it all */
        .tag { --sq: 150px; position: absolute; top: 72px; left: 24px; display: flex; height: var(--sq);
          border: 1.5px solid ${WHITE}; border-radius: 8px; overflow: hidden; color: ${WHITE};
          font-size: 14px; letter-spacing: 0.05em; text-transform: uppercase; }
        .tag > * + * { border-left: 1.5px solid ${WHITE}; }
        .tag .scope { width: var(--sq); flex: none; }
        .tag .spine { flex: none; display: grid; place-items: center; padding: 0 6px;
          writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: 0.14em; white-space: nowrap; }
        /* a fixed width, so changing readouts never shift the label */
        .tag .body { flex: none; width: 33ch; display: flex; flex-direction: column; padding: 10px 12px; }
        .tag .body > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; }
        .tag .dots { border-top: 1.5px dotted ${WHITE}; margin: 10px -12px auto; }
        @media (max-width: 715px) {
          .tag { --sq: 104px; top: 64px; font-size: 11px; max-width: calc(100vw - 48px); }
          .tag .spine { padding: 0 4px; }
          .tag .body { width: auto; flex: 1; min-width: 0; padding: 7px 8px; }
          .tag .dots { margin: 7px -8px auto; }
        }
      `}</style>
      <div className="tag">
        <div className="scope">
          <AnalogueStrip scope onMetrics={(m) => { latest.current = m; }} />
        </div>
        <div className="spine" style={r?.live ? { background: WHITE, color: DESKTOP } : undefined}>{status}</div>
        <div className="body">
          <div>STATION {clock ?? '--:--:--'} ET</div>
          <div className="dots" aria-hidden />
          <div>{track ? track.title : 'PRESS ▶ TO TUNE IN'}</div>
          <div>{track ? `${track.artist} · ${track.kind === 'inter' ? 'BREAK' : 'MIX'} · ${track.duration || '--:--'}` : 'NOTHING PLAYING'}</div>
          <div>{f1(r?.mom ?? NaN)} LUFS · TP {f1(r?.tp ?? NaN)} · W {width}%</div>
        </div>
      </div>

      {/* README and RADAR — top-right corner */}
      <Link href="/station/readme" style={{ position: 'absolute', top: 24, right: 24, zIndex: 5, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)', textDecoration: 'none' }}>
        README
      </Link>
      <Link href="/station/radar" style={{ position: 'absolute', top: 44, right: 24, zIndex: 5, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)', textDecoration: 'none' }}>
        RADAR
      </Link>
    </div>
  );
}
