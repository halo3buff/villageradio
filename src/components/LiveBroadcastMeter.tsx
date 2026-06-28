'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';

/**
 * Live-broadcast goniometer — a brutalist rebuild of a classic stereo vector
 * scope (see references/screenshots/test_vector_3.png).
 *
 * Built in the reference's native 755×859 space, then uniformly scaled to the
 * requested render `width`. Flat / square corners throughout (no bevels).
 *
 * Changes from the reference (per spec):
 *   • window title reads "Live Broadcast" (not "Goniometer")
 *   • the "Display / Lines" dropdown is replaced by a Play control and a
 *     Levels stepper (▲ / ▼ buttons — not a slider)
 *   • Play starts / stops the broadcast
 */

const NW = 755;
const NH = 859;

const SANS = "'Helvetica Neue', Arial, sans-serif";

// chrome
const CHROME = '#ececec';
const CHROME_HI = '#f6f6f6';
const CHROME_LO = '#dcdcdc';
const CHROME_BORDER = '#8a8a8a';
const CHROME_TEXT = '#1c1c1c';

// scope — chrome is taller now (title 40 + toolbar 28)
const SCOPE_TOP = 68;
const CX = 377;
const CY = 418;
const HALF = 190;          // diagonal half-length
const TRACE_R = 182;       // signal → px scale
const AXIS = 'rgba(228,228,228,0.6)';
const SCALE_TEXT = '#cfcfcf';
const CORR_GREEN = '#8fe000';
const RED = '#c40000';

// bottom phase scale
const SCALE_Y = 802;

const SAMPLE_COUNT = 1500;
const VOL_STEP = 0.1;

export function LiveBroadcastMeter({ width = 430 }: { width?: number }) {
  const { isPlaying, mode, broadcastPlay, pause, analyserL, analyserR, volume, setVolume } =
    useAudio();

  const aLRef = useRef<AnalyserNode | null>(null);
  const aRRef = useRef<AnalyserNode | null>(null);
  useEffect(() => { aLRef.current = analyserL; }, [analyserL]);
  useEffect(() => { aRRef.current = analyserR; }, [analyserR]);

  const isBroadcasting = mode === 'broadcast' && isPlaying;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tickRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastNumRef = useRef<number>(0);
  // reusable sample buffers — allocating these every frame churns the GC and
  // produces main-thread jank that can glitch audio playback.
  const bufLRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const bufRRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(2048));
  const [corrPct, setCorrPct] = useState(0);

  const scale = width / NW;
  const height = NH * scale;

  const drawAxes = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, NW, NH);
    ctx.strokeStyle = AXIS;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CX - HALF, CY - HALF); ctx.lineTo(CX + HALF, CY + HALF);  // L axis
    ctx.moveTo(CX + HALF, CY - HALF); ctx.lineTo(CX - HALF, CY + HALF);  // R axis
    ctx.stroke();
  }, []);

  // initial paint
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = NW * dpr;
    canvas.height = (NH - SCOPE_TOP) * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.translate(0, -SCOPE_TOP);
    drawAxes(ctx);
  }, [drawAxes]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(animate); return; }

    // phosphor decay
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, SCOPE_TOP, NW, NH - SCOPE_TOP);
    drawAxes(ctx);

    const aL = aLRef.current;
    const aR = aRRef.current;
    let corr = 0;

    if (aL && aR && isBroadcasting) {
      const bufL = bufLRef.current;
      const bufR = bufRRef.current;
      aL.getFloatTimeDomainData(bufL);
      aR.getFloatTimeDomainData(bufR);
      const stride = Math.max(1, Math.floor(bufL.length / SAMPLE_COUNT));

      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(102,255,0,0.75)';
      let sLR = 0, sLL = 0, sRR = 0;
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const idx = i * stride;
        const l = bufL[idx], r = bufR[idx];
        const x = CX + (r - l) * TRACE_R;     // 45°-rotated: mono → vertical
        const y = CY - (l + r) * TRACE_R;
        ctx.fillRect(x, y, 1.4, 1.4);          // plot points, not lines
        sLR += l * r; sLL += l * l; sRR += r * r;
      }
      ctx.globalCompositeOperation = 'source-over';
      const denom = Math.sqrt(sLL * sRR);
      corr = denom > 1e-6 ? Math.max(-1, Math.min(1, sLR / denom)) : 0;
    }

    // red correlation needle along the 0–180 scale (corr +1 → 0, −1 → 180)
    if (tickRef.current) {
      const pos = ((1 - corr) / 2) * NW;
      tickRef.current.style.left = `${pos}px`;
    }
    const now = performance.now();
    if (now - lastNumRef.current > 150) {
      lastNumRef.current = now;
      setCorrPct(isBroadcasting ? Math.round(corr * 100) : 0);
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [drawAxes, isBroadcasting]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  const label = (l: number, t: number, text: string, color = SCALE_TEXT, fs = 12): React.CSSProperties & { __t: string } => ({
    position: 'absolute', left: l, top: t, color, fontSize: fs,
    fontFamily: SANS, pointerEvents: 'none', __t: text,
  });

  const stepVol = (d: number) => setVolume(Math.max(0, Math.min(1, volume + d)));

  return (
    <div style={{ width, height, position: 'relative', fontFamily: SANS,
      border: `1px solid ${CHROME_BORDER}`, boxSizing: 'border-box', userSelect: 'none' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: NW, height: NH,
        transform: `scale(${scale})`, transformOrigin: 'top left' }}>

        {/* ── title bar ─────────────────────────────────────────────────── */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: NW, height: 40,
          background: `linear-gradient(180deg,${CHROME_HI},${CHROME_LO})`,
          borderBottom: `1px solid ${CHROME_BORDER}`, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff2a2a',
            boxShadow: '0 0 5px rgba(255,42,42,0.85)', animation: 'vr-blink 1.2s infinite' }} />
          <span style={{ color: CHROME_TEXT, fontSize: 17, fontWeight: 400 }}>Live Broadcast</span>
          <button style={{ position: 'absolute', right: 8, top: 8, height: 24, padding: '0 12px',
            background: `linear-gradient(180deg,#fbfbfb,#e4e4e4)`, border: `1px solid ${CHROME_BORDER}`,
            borderRadius: 0, color: CHROME_TEXT, fontSize: 14, fontFamily: SANS, cursor: 'pointer' }}>
            Edit…
          </button>
        </div>

        {/* ── toolbar: Play + Levels stepper ────────────────────────────── */}
        <div style={{ position: 'absolute', left: 0, top: 40, width: NW, height: 28,
          background: CHROME, borderBottom: `1px solid ${CHROME_BORDER}`, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingRight: 10 }}>
          <button
            onClick={() => (isBroadcasting ? pause() : broadcastPlay())}
            style={{ height: 22, padding: '0 14px', background: isBroadcasting ? '#cfe9c2' : '#fff',
              border: `1px solid ${CHROME_BORDER}`, borderRadius: 0, fontSize: 14, lineHeight: '20px',
              fontFamily: SANS, color: CHROME_TEXT, cursor: 'pointer' }}>
            {isBroadcasting ? 'Pause' : 'Play'}
          </button>
          <span style={{ color: '#3a3a3a', fontSize: 14 }}>Levels</span>
          <div style={{ display: 'flex' }}>
            <button onClick={() => stepVol(VOL_STEP)} aria-label="Levels up"
              style={stepBtn}>▲</button>
            <button onClick={() => stepVol(-VOL_STEP)} aria-label="Levels down"
              style={{ ...stepBtn, borderLeft: 'none' }}>▼</button>
          </div>
        </div>

        {/* ── scope ─────────────────────────────────────────────────────── */}
        <div style={{ position: 'absolute', left: 0, top: SCOPE_TOP, width: NW, height: NH - SCOPE_TOP,
          background: '#000', overflow: 'hidden' }}>
          <canvas ref={canvasRef}
            style={{ position: 'absolute', left: 0, top: 0, width: NW, height: NH - SCOPE_TOP }} />
        </div>

        {/* scope labels */}
        <Txt s={label(CX - 4, SCOPE_TOP + 4, 'M')} />
        <Txt s={label(CX - HALF - 12, CY - HALF - 4, 'L')} />
        <Txt s={label(CX + HALF + 4, CY - HALF - 4, 'R')} />
        <Txt s={label(4, CY - 8, '+S')} />
        <Txt s={label(NW - 22, CY - 8, '−S')} />

        {/* bottom phase scale */}
        <Txt s={label(4, SCALE_Y - 14, String(corrPct), CORR_GREEN, 12)} />
        <Txt s={label(4, SCALE_Y, '0')} />
        <Txt s={label(CX - 8, SCALE_Y, '90')} />
        <Txt s={label(NW - 24, SCALE_Y, '180')} />
        <div ref={tickRef} style={{ position: 'absolute', top: SCALE_Y - 2, left: CX, width: 2,
          height: 16, background: RED, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

const stepBtn: React.CSSProperties = {
  width: 22, height: 22, padding: 0, background: `linear-gradient(180deg,#fbfbfb,#e0e0e0)`,
  border: `1px solid ${CHROME_BORDER}`, borderRadius: 0, fontSize: 9, lineHeight: '20px',
  color: '#333', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

// tiny helper so labels can carry their text in the style object
function Txt({ s }: { s: React.CSSProperties & { __t: string } }) {
  const { __t, ...style } = s;
  return <span style={style}>{__t}</span>;
}
