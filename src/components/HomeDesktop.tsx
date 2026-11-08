'use client';

import Link from 'next/link';
import { stationClock } from '@/components/StationBar';
import { BROADCAST_TZ, secondsIntoDay } from '@/lib/content/broadcast';
import { useAudio } from '@/lib/audio-context';
import { VISUAL_TRIM_DB } from '@/lib/audio/loudness';
import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const WHITE = '#ffffff';
const W = 104, H = 64;    // the Lissajous window
const REACH = 28, DOT = 1.75;  // full scale, in px, stops short of the edges
const STEP = 8;   // samples between dots, so each stays its own light
// the floor: quieter than this (dBFS RMS) the figure is held at this size, its shape intact, so a
// quiet stretch still moves; louder plays exactly as before. Never lifted more than LIFT_MAX.
const FLOOR_DB = -30, LIFT_MAX_DB = 40, LIFT_EASE_S = 0.5;
// on play the test figure's dots gather to the centre while the broadcast comes up (alongside it, never
// holding it back), each on its own: a delay, a pace and a curve of its own, all done inside GATHER_MS
const GATHER_MS = 200;
// on pause the reverse: the figure's last dots gather to the centre the same way, then come out of it
// into the ring of orbs inside EMERGE_MS
const EMERGE_MS = 450;
const SWARM = Array.from({ length: 512 }, () => {
  const delay = Math.random() * 0.3;
  return { delay, pace: delay + 0.5 + Math.random() * (0.5 - delay), curl: (Math.random() - 0.5) * 0.6 };
});

// Off air, the PlayStation 2's clock: seven orbs chasing round a ring that tells the station's time,
// as its System Configuration clock does. Orb i runs i laps a minute ahead of the first, so the seven
// fall into step on the seconds that divide the minute: one orb at :00, two at :30, three at :20/:40,
// four at :15/:45, five at :12/:24/:36/:48, six at :10/:50, and spread between. All of them run
// RING_LAPS a minute, so at :00 the one orb is on the hour (12 o'clock on top). The ring rocks back
// and forth about its horizontal axis (ROCK): open every 10 s, tipped flattest between,
// swaying a little side to side as it goes (SWAY), and it starts each hour small, growing.
const ORB_N = 7;
const RING_LAPS = 24;                 // laps a minute for the slowest orb (whole, to land on the hour)
const RING_MIN = 18, RING_MAX = 26;   // px radius at the top of the hour and just before the next
const ROCK = 1.1, SWAY = 0.3;         // rad the ring tips back and forth (period 20 s), and sways (15 s)
const TRAIL = 22, TRAIL_DT = 0.05;    // tail: steps back along the path, seconds a step
const HALO = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],   // a core, and a ring round it
  ...Array.from({ length: 8 }, (_, i) => [1.8 * Math.cos((i * Math.PI) / 4), 1.8 * Math.sin((i * Math.PI) / 4)])];
const HALO_PX = 1.25;                 // every orb the same size
/** Orb i on the clock at c (station seconds into the day): x, y (px from the centre) and brightness. */
function orbAt(i: number, c: number) {
  c += 86_400;   // a trail reaching back past midnight
  const sec = c % 60, hour = (c / 3600) % 12;
  const th = (hour / 12 + ((RING_LAPS + i) * sec) / 60) * 2 * Math.PI;
  const rad = RING_MIN + (RING_MAX - RING_MIN) * ((c / 3600) % 1);
  const X = Math.sin(th) * rad, Y = -Math.cos(th) * rad;
  const sway = SWAY * Math.sin((2 * Math.PI * sec) / 15), pitch = ROCK * Math.sin((2 * Math.PI * sec) / 20);
  const z = X * Math.sin(sway);
  return [X * Math.cos(sway), Y * Math.cos(pitch) - z * Math.sin(pitch), 0.75 + (0.25 * (Y * Math.sin(pitch) + z * Math.cos(pitch))) / rad];
}
/** Every dot of the orbs at clock c: x, y (px from the centre) and brightness. */
function orbDots(c: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ORB_N; i++) {
    const [x, y, a] = orbAt(i, c);
    for (const [hx, hy] of HALO) out.push([x + hx * HALO_PX, y + hy * HALO_PX, a]);
    for (let k = 1; k <= TRAIL; k++) {
      const [tx, ty, ta] = orbAt(i, c - k * TRAIL_DT);
      out.push([tx, ty, 0.6 * ta * (1 - k / (TRAIL + 1)) ** 1.6]);   // faint, as the PS2's are
    }
  }
  return out;
}

type Readout = { lvl: string; pk: string; corr: string; bal: string };

// TX: the broadcast day's number, counted from the station's first day on air (day 1).
const FIRST_DAY = Date.UTC(2026, 4, 17);
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: BROADCAST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
function txDay(nowMs: number) {
  const [y, m, d] = dateFmt.format(nowMs).split('-').map(Number);
  return String((Date.UTC(y, m - 1, d) - FIRST_DAY) / 86_400_000 + 1).padStart(4, '0');
}

// The top of the hour, on air: three short pips and a long one, the long one landing on :00:00 as the
// orbs' clock does, played over the broadcast at a fraction of its volume.
const PIPS = [[-3, 0.1], [-2, 0.1], [-1, 0.1], [0, 0.5]], PIP_HZ = 1000, PIP_LEVEL = 0.06;

/**
 * The station as a small white outline in the top-left corner: the call sign, clock, state and
 * readouts, then at its right end a bordered Lissajous of the stereo field in glowing dots. Off
 * air it and the readouts follow a test signal, so nothing stops. README and RADAR top-right; the
 * prompt is global (see SiteFrame). The StationBar stays off here.
 */
/** res: the Lissajous canvas drawn this many times sharper, for the recording frame, which zooms the plate. */
export function HomeDesktop({ res = 1 }: { res?: number }) {
  const { analyserL, analyserR, isPlaying, mode, broadcastPlay, pause, volume } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const [clock, setClock] = useState<string | null>(null);
  const [rd, setRd] = useState<Readout | null>(null);
  const ch = useRef({ aL: analyserL, aR: analyserR });
  const liveRef = useRef(live);
  liveRef.current = live;
  ch.current = { aL: analyserL, aR: analyserR };
  const lights = useRef<HTMLCanvasElement>(null);

  // the body's min-h-screen is iOS's LARGE viewport, taller than what's visible with the URL bar
  // up: drop it while the station is up, so the page has nothing to scroll (as HomeTemp does)
  useEffect(() => {
    const body = document.body;
    const prev = body.style.minHeight;
    body.style.minHeight = '0';
    return () => { body.style.minHeight = prev; };
  }, []);

  useEffect(() => {
    const canvas = lights.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * res;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    let l = new Float32Array(2048), r = new Float32Array(2048);
    let nextRead = 0, raf = 0, lift = 0, last = 0, gatherAt = 0, scatterAt = -1e9, wasLive = false;
    const held: number[] = [];   // the figure's dots as last drawn on air (x, y from the centre), for the scatter
    const clock0 = secondsIntoDay(Date.now()) - performance.now() / 1000;   // the station's clock, on the frame clock

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const { aL, aR } = ch.current;
      const t = now / 1000;
      if (wasLive && !liveRef.current && held.length) scatterAt = now;
      wasLive = liveRef.current;

      // the broadcast, or the test signal whenever nothing's flowing
      let energy = 0;
      if (aL && aR) {
        if (l.length !== aL.fftSize) { l = new Float32Array(aL.fftSize); r = new Float32Array(aL.fftSize); }
        aL.getFloatTimeDomainData(l); aR.getFloatTimeDomainData(r);
        for (let i = 0; i < l.length; i++) energy += l[i] * l[i] + r[i] * r[i];
      }
      const testing = energy < 1e-9;
      if (testing) {
        const amp = 0.58 + 0.04 * Math.sin(t * 0.7), w = (Math.PI * 2) / l.length;
        for (let i = 0; i < l.length; i++) {
          l[i] = amp * Math.sin(3 * w * i) + (Math.random() - 0.5) * 0.006;
          r[i] = amp * Math.sin(2 * w * i + t * 0.25) + (Math.random() - 0.5) * 0.006;
        }
      }

      if (now >= nextRead) {
        nextRead = now + 150;
        let ll = 0, rr = 0, lr = 0, pk = 0;
        for (let i = 0; i < l.length; i++) {
          ll += l[i] * l[i]; rr += r[i] * r[i]; lr += l[i] * r[i];
          pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i]));
        }
        const sign = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);
        const db = (v: number) => v.toFixed(1).padStart(5);
        const sl = Math.sqrt(ll), sr = Math.sqrt(rr);
        setClock(stationClock());
        setRd({
          lvl: db(10 * Math.log10((ll + rr) / (2 * l.length) || 1e-12)),
          pk: db(20 * Math.log10(pk || 1e-6)),
          corr: sign(sl && sr ? lr / (sl * sr) : 0),
          bal: sign(sl + sr ? (sr - sl) / (sr + sl) : 0),
        });
      }

      // R against L in a square, so mono runs up the diagonal; full scale stops short of the edges
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = WHITE;
      const level = 10 * Math.log10(energy / (2 * l.length) || 1e-12);
      const want = testing ? 0 : Math.min(LIFT_MAX_DB, Math.max(0, FLOOR_DB - level));
      // drops at once when the audio comes back up, so a hit never overshoots; rises gently
      lift = want < lift ? want : lift + (want - lift) * (1 - Math.exp(-Math.min(0.25, (now - last) / 1000) / LIFT_EASE_S));
      last = now;
      const gain = Math.pow(10, (VISUAL_TRIM_DB + lift) / 20);
      if (!testing && liveRef.current) {
        held.length = 0;
        for (let i = 0; i < l.length; i += STEP) {
          const x = W / 2 + Math.max(-1, Math.min(1, r[i] * gain)) * REACH;
          const y = H / 2 - Math.max(-1, Math.min(1, l[i] * gain)) * REACH;
          ctx.fillRect(Math.round(x - DOT / 2), Math.round(y - DOT / 2), DOT, DOT);
          held.push(x - W / 2, y - H / 2);
        }
      }

      // the orbs: gliding while paused, gathering once play is pressed, held as one point until the audio arrives,
      // and on pause gathered back out of the figure
      if (!liveRef.current) gatherAt = 0;
      else if (!gatherAt) gatherAt = now;
      const el = gatherAt ? (now - gatherAt) / GATHER_MS : 0;
      const sIn = (now - scatterAt) / GATHER_MS, sOut = (now - scatterAt - GATHER_MS) / EMERGE_MS;
      if (!liveRef.current && sOut < 1) {
        // just paused: the last figure's dots gather to the centre as on play, then come back out of it
        // onto the orbs; the spares fade on the way in
        const orbs = orbDots(clock0 + t), m = held.length / 2;
        for (let j = 0; j < Math.max(orbs.length, m); j++) {
          const d = SWARM[j % SWARM.length], out = sOut > 0;
          if (out && j >= orbs.length) continue;
          const k = Math.max(0, Math.min(1, ((out ? sOut : sIn) - d.delay) / (d.pace - d.delay)));
          const e = k * k * (3 - 2 * k), bow = Math.sin(Math.PI * k) * d.curl;
          const [dx, dy, a] = out ? orbs[j] : [held[2 * (j % m)], held[2 * (j % m) + 1], 1];
          const keep = out ? e : 1 - e;
          const x = W / 2 + (dx - dy * bow) * keep, y = H / 2 + (dy + dx * bow) * keep;
          ctx.globalAlpha = out ? a : j < orbs.length ? 1 : 1 - k;
          ctx.fillRect(Math.round(x - DOT / 2), Math.round(y - DOT / 2), DOT, DOT);
        }
        ctx.globalAlpha = 1;
      } else if (testing || el < 1) {
        orbDots(clock0 + t).forEach(([dx, dy, a], j) => {
          const d = SWARM[j % SWARM.length];
          const k = Math.max(0, Math.min(1, (el - d.delay) / (d.pace - d.delay)));
          if (!testing && k >= 1) return;
          const keep = 1 - k * k * (3 - 2 * k), bow = Math.sin(Math.PI * k) * d.curl;   // eased in and out, and bowed off the straight line
          const x = W / 2 + (dx - dy * bow) * keep, y = H / 2 + (dy + dx * bow) * keep;
          ctx.globalAlpha = a * (testing ? 1 : 1 - k);
          ctx.fillRect(Math.round(x - DOT / 2), Math.round(y - DOT / 2), DOT, DOT);
        });
        ctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [res]);

  // the pips, armed a few seconds before each hour while on air, so they're timed on the audio clock
  useEffect(() => {
    const ctx = analyserL?.context as AudioContext | undefined;
    if (!live || !ctx) return;
    let timer: ReturnType<typeof setTimeout>;
    let tones: OscillatorNode[] = [];
    const arm = () => {
      const left = 3600 - (secondsIntoDay(Date.now()) % 3600);   // seconds to the top of the hour
      if (left > 5) { timer = setTimeout(arm, (left - 5) * 1000); return; }
      const at = ctx.currentTime + left;
      tones = PIPS.filter(([t]) => left + t > 0.05).map(([t, len]) => {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.frequency.value = PIP_HZ;
        g.gain.setValueAtTime(0, at + t);
        g.gain.linearRampToValueAtTime(PIP_LEVEL * volume, at + t + 0.005);   // ramped, so no click
        g.gain.setValueAtTime(PIP_LEVEL * volume, at + t + len - 0.005);
        g.gain.linearRampToValueAtTime(0, at + t + len);
        osc.connect(g).connect(ctx.destination);
        osc.start(at + t); osc.stop(at + t + len);
        return osc;
      });
      timer = setTimeout(arm, (left + 2) * 1000);
    };
    arm();
    return () => { clearTimeout(timer); tones.forEach((o) => { try { o.stop(); } catch { /* already done */ } }); };
  }, [live, analyserL, volume]);

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', inset: 0, paddingBottom: PROMPT_BAND,
      overflow: 'hidden', overscrollBehavior: 'contain',
      fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)',
    }}>
      <style>{`
        /* all white, drawn straight on the page: the type and borders barely glow, the lights do */
        .plate { position: absolute; top: 24px; left: 24px; display: flex; gap: 6px; padding: 6px; color: ${WHITE}; border: 1px solid ${WHITE};
          font-size: 11px; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; white-space: pre;
          text-shadow: 0 0 3px rgba(255,255,255,0.3); box-shadow: 0 0 3px rgba(255,255,255,0.3); isolation: isolate; }
        /* on a layer of its own: a backdrop-filter on the plate itself would cut the window's blur off from the page */
        .plate::before { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(0,0,0,0.02); backdrop-filter: blur(1px); -webkit-backdrop-filter: blur(1px); }
        .plate .info { padding: 3px 12px 3px 6px; display: grid; grid-template-columns: auto auto; column-gap: 22px; row-gap: 3px; align-content: center; }
        .plate .info .end { text-align: right; }
        .plate button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 7px; padding: 6px 12px 6px 0; margin: -6px 0; }
        .plate button:active { opacity: 0.6; }
        .plate .lamp { width: 6px; height: 6px; background: currentColor; animation: lamp 1s steps(1) infinite; }
        @keyframes lamp { 50% { opacity: 0; } }
        .plate .window { border: 1px solid ${WHITE}; display: flex; box-shadow: 0 0 3px rgba(255,255,255,0.3);
          background: rgba(0,0,0,0.03); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
        .plate canvas { display: block; width: ${W}px; height: ${H}px; margin: auto 6px;
          filter: drop-shadow(0 0 3px rgba(255,255,255,0.95)) drop-shadow(0 0 9px rgba(255,255,255,0.7)); }
        @media (max-width: 715px) {
          .plate { top: 72px; left: 16px; }
        }
      `}</style>

      <div className="plate">
        <div className="info">
          <span>VGF-8194</span>
          <span className="end">{clock ?? '--:--:--'}</span>
          <button onClick={() => (live ? pause() : broadcastPlay())} aria-label={live ? 'Pause the station' : 'Play the station'}>
            <svg viewBox="0 0 8 9" fill="currentColor" aria-hidden width="7" height="8">
              {live ? <><rect x="0" y="0" width="2.5" height="9" /><rect x="5.5" y="0" width="2.5" height="9" /></>
                : <path d="M0 0 L8 4.5 L0 9 Z" />}
            </svg>
            {live ? 'ON AIR' : 'TEST'}
            {live && <i className="lamp" />}
          </button>
          <span className="end">{clock ? `TX ${txDay(Date.now())}` : ''}</span>
          <span>LVL {rd?.lvl ?? '   --'} DB</span>
          <span className="end">PK {rd?.pk ?? '   --'} DB</span>
          <span>CORR {rd?.corr ?? '   --'}</span>
          <span className="end">BAL {rd?.bal ?? '   --'}</span>
        </div>
        <div className="window"><canvas ref={lights} aria-hidden /></div>
      </div>

      {/* README and RADAR — top-right corner */}
      <Link href="/station/readme" style={{ position: 'absolute', top: 24, right: 24, zIndex: 5, color: 'inherit', textDecoration: 'none' }}>
        README
      </Link>
      <Link href="/station/radar" style={{ position: 'absolute', top: 44, right: 24, zIndex: 5, color: 'inherit', textDecoration: 'none' }}>
        RADAR
      </Link>
    </div>
  );
}
