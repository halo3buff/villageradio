'use client';

import { useEffect, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const RED = '#ff0000';

// Default scope position in the 1440×1024 stage — matches HomeDesktop defaults
const DEFAULT_SL = 274;
const DEFAULT_ST = 200;
const DEFAULT_SW = 600;
const DEFAULT_SH = 660;

function z2(n: number) { return String(Math.floor(n)).padStart(2, '0'); }

function buildClock(d: Date) {
  const h = z2(d.getUTCHours()), m = z2(d.getUTCMinutes()), s = z2(d.getUTCSeconds());
  const f = z2(Math.floor(d.getUTCMilliseconds() / 10));
  return { utc: `${h}:${m}:${s} UTC`, mil: `${h}${m}${s}Z`, bc: `T-${h}:${m}:${s}:${f}` };
}

function hexLine(seed: number) {
  let out = '';
  const rnd = (i: number) => Math.abs(Math.sin(i * 997.31 + seed * 0.01)) * 0xffff;
  for (let i = 0; i < 24; i++) {
    out += `0x${Math.floor(rnd(i)).toString(16).padStart(4, '0').toUpperCase()} `;
    if (i % 6 === 5) out += '// ';
  }
  return out;
}

export function ScopeTelemetry({
  sl = DEFAULT_SL, st = DEFAULT_ST, sw = DEFAULT_SW, sh = DEFAULT_SH, above = false,
}: { sl?: number; st?: number; sw?: number; sh?: number; above?: boolean } = {}) {
  const [clock, setClock] = useState(() => buildClock(new Date()));
  const [ticker, setTicker] = useState(() => hexLine(0));

  useEffect(() => {
    let f = 0;
    const id = setInterval(() => {
      f++;
      setClock(buildClock(new Date()));
      if (f % 4 === 0) setTicker(hexLine(f));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* ── TIMECODE — right-aligned. Default: inside the scope box, with a bg
           that occludes the lattice underneath. `above`: floated just above the
           grid (density-plot mode), transparent, no occlusion. ── */}
      <div style={above ? {
        position: 'absolute',
        left: sl, top: st - 46, width: sw,
        textAlign: 'right', pointerEvents: 'none', zIndex: 3,
      } : {
        position: 'absolute',
        left: sl + sw - 118,
        top: st + 8,
        width: 110,
        textAlign: 'right',
        pointerEvents: 'none',
        zIndex: 3,
        background: 'var(--vlg-bg, #fff)',
        padding: '2px 4px', margin: '-2px -4px -2px 0',
      }}>
        <div style={{ fontFamily: MONO, fontSize: above ? 11 : 12, lineHeight: '14px', fontVariantNumeric: 'tabular-nums' }}>
          <div style={{ color: above ? 'var(--vlg-strong, #000)' : 'var(--vlg-fg-dim, #555)' }}>{clock.utc}</div>
          <div style={{ color: above ? 'var(--vlg-strong, #000)' : 'var(--vlg-fg-dim, #555)' }}>{clock.mil}</div>
          <div style={{ color: RED }}>{clock.bc}</div>
        </div>
      </div>

      {/* ── FREQ TICKER — scrolling strip below the scope box ── */}
      <div style={{
        position: 'absolute', left: sl, top: st + sh + 6, width: sw, height: 14,
        overflow: 'hidden', pointerEvents: 'none',
      }}>
        <div className="ticker" style={{
          fontFamily: MONO, fontSize: 7, lineHeight: '10px', letterSpacing: '0.05em',
          color: 'var(--vlg-fg-dim, #555)', whiteSpace: 'nowrap',
        }}>
          {ticker}&nbsp;&nbsp;&nbsp;&nbsp;{ticker}
        </div>
      </div>
    </>
  );
}
