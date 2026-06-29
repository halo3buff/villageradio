'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRef, useEffect, useState } from 'react';
import { useAudio } from '@/lib/audio-context';
import type { Mix } from '@/lib/types';
import { Waterfall3D } from '@/components/instruments/Waterfall3D';
import { ContourSpectrogram } from '@/components/instruments/ContourSpectrogram';
import { PoleZero } from '@/components/instruments/PoleZero';
import { LiveVideo } from '@/components/instruments/LiveVideo';
import { Panel } from '@/components/instruments/Panel';
import { MONO, CYAN, SCANLINES } from '@/components/instruments/retro';

/**
 * Listen page — a four-channel signal-analysis rack. No window chrome: every channel
 * is a bare black panel separated only by a thin gray hairline, with a single corner
 * tag + status LED (rack-equipment signalling, not software UI). One unified nameplate
 * rail spans the top of the console; the right column is the ARCHIVE.
 *
 *   Q1 top-left  — WAVE       (Al-Hadath livestream monitor)
 *   Q2 top-right — WFALL      (3-D spectral-decay terrain, cyan wireframe)
 *   Q3 bot-left  — CONTOUR    (2-D discrete-palette contour heatmap)
 *   Q4 bot-right — Z-PLANE    (real-time LPC pole-zero display)
 *   sidebar      — ARCHIVE    (browse + select past broadcast mixes)
 *
 * Built in a 16:9 native space (1600×900) that scales to fill a widescreen.
 */

const STAGE_W = 1600;
const STAGE_H = 900;

const EQ = { x: 150, y: 80, w: 1300, h: 608 };
const SW = 220;        // archive column
const RAIL_H = 22;     // unified nameplate rail

const GRID_H = EQ.h - RAIL_H;
const COL_W = Math.round((EQ.w - SW) / 2);
const ROW_H = Math.round(GRID_H / 2);

const VIDEO   = { x: 0,         y: RAIL_H,         w: COL_W, h: ROW_H };
const WFALL   = { x: COL_W,     y: RAIL_H,         w: COL_W, h: ROW_H };
const CONTOUR = { x: 0,         y: RAIL_H + ROW_H, w: COL_W, h: GRID_H - ROW_H };
const PZ      = { x: COL_W,     y: RAIL_H + ROW_H, w: COL_W, h: GRID_H - ROW_H };
const RACK    = { x: COL_W * 2, y: RAIL_H,         w: EQ.w - COL_W * 2, h: GRID_H };

// dancing-figure sprites: a continuous parade across the full width, bottom-aligned.
const FIGS = [-20, 160, 340, 520, 700, 880, 1060, 1240, 1420, 1600];
const FIG_W = 204;
const FIG_TOP = STAGE_H - FIG_W;

function timecode(ms: number): string {
  const f = Math.floor((ms / 1000) * 30) % 30;
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600) % 24)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f)}`;
}

export function ListenConsole() {
  const {
    isPlaying, mode, currentTrack, playlist,
    broadcastPlay, play, toggle,
  } = useAudio();

  const clockRef = useRef<HTMLSpanElement>(null);
  const startRef = useRef(0);

  // brief DSP boot graphic over the live monitor on entry (decorative intro; with the
  // direct HLS feed there is no YouTube chrome left to hide). Dismisses when the feed
  // is ready, with a fallback timeout so it never hangs if the feed is slow/down.
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 4000);
    return () => clearTimeout(t);
  }, []);
  const onVideoReady = () => setTimeout(() => setBooted(true), 1200);

  const [scale, setScale] = useState(1);
  const [centerY, setCenterY] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const vp = window.visualViewport;
      const vw = vp?.width ?? window.innerWidth;
      const vh = vp?.height ?? window.innerHeight;
      const offsetTop = vp?.offsetTop ?? 0;
      setScale(Math.min(vw / STAGE_W, vh / STAGE_H));
      setCenterY(offsetTop + vh / 2);
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  // master clock tick for the nameplate rail
  useEffect(() => {
    startRef.current = performance.now() - 3600_000;
    const id = setInterval(() => {
      if (clockRef.current) clockRef.current.textContent = timecode(performance.now() - startRef.current);
    }, 50);
    return () => clearInterval(id);
  }, []);

  // ---- archive selection ----
  const onLive = () => { if (mode === 'broadcast' && isPlaying) toggle(); else broadcastPlay(); };
  const onSelectClip = (track: Mix) => {
    if (mode === 'individual' && currentTrack?.id === track.id) toggle();
    else play(track);
  };
  const onTransport = () => { if (mode === 'idle' || !currentTrack) broadcastPlay(); else toggle(); };

  const live = isPlaying && mode !== 'idle';
  const liveSelected = mode === 'broadcast';
  const statusLabel = !currentTrack ? 'IDLE' : !isPlaying ? 'PAUSED' : mode === 'broadcast' ? 'LIVE' : 'PLAYING';
  const ledState = live ? 'live' as const : 'idle' as const;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#fff' }}>
      <div className="page-enter" style={{
        position: 'absolute', left: '50%',
          top: centerY !== null ? centerY : '50%',
          width: STAGE_W, height: STAGE_H,
        transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center center',
      }}>
        <Link href="/" aria-label="Back home" style={{ position: 'absolute', left: 8, top: 22, width: 52, height: 52, display: 'block' }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={52} height={52} priority />
        </Link>

        {FIGS.map((x) => (
          <Image key={x} src="/images/dancing-figures.png" alt="" aria-hidden width={FIG_W} height={FIG_W + 1}
            style={{ position: 'absolute', left: x, top: FIG_TOP, width: FIG_W, height: FIG_W + 1, pointerEvents: 'none' }} />
        ))}

        <div style={{ position: 'absolute', left: EQ.x, top: EQ.y, width: EQ.w, height: EQ.h, background: '#000', border: '1px solid #3a3a3a', boxSizing: 'border-box', userSelect: 'none' }}>
          {/* unified nameplate rail */}
          <div style={{
            position: 'absolute', left: 0, top: 0, width: EQ.w, height: RAIL_H,
            display: 'flex', alignItems: 'center', gap: 14, padding: '0 10px',
            borderBottom: '1px solid #3a3a3a', boxSizing: 'border-box',
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', color: 'rgba(210,210,210,0.7)',
            background: '#060606',
          }}>
            <span style={{ color: 'rgba(225,225,225,0.85)' }}>VLG-4CH</span>
            <span style={{ color: 'rgba(170,170,170,0.55)' }}>SIGNAL ANALYZER</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: live ? '#36e05a' : '#d8a23a', boxShadow: `0 0 4px ${live ? '#36e05a' : '#d8a23a'}`,
                animation: live ? 'vrPulse 1.6s ease-in-out infinite' : undefined,
              }} />
              <span>{live ? 'LIVE' : 'IDLE'}</span>
            </span>
            <span ref={clockRef} style={{ color: 'rgba(225,225,225,0.85)', letterSpacing: '0.1em' }}>01:00:00:00</span>
          </div>

          {/* Q1 — Al-Hadath video monitor */}
          <Pane rect={VIDEO}>
            <Panel width={VIDEO.w} height={VIDEO.h} tag="WAVE" led={ledState}>
              {() => (
                <>
                  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}>
                    <LiveVideo onReady={onVideoReady} />
                  </div>
                  <Scanlines />
                  <VideoBoot done={booted} />
                </>
              )}
            </Panel>
          </Pane>

          {/* Q2 — 3-D waterfall (spectral decay) */}
          <Pane rect={WFALL}>
            <Panel width={WFALL.w} height={WFALL.h} tag="WFALL" led={ledState}>
              {(c) => (<><Waterfall3D width={c.w} height={c.h} /><Scanlines /></>)}
            </Panel>
          </Pane>

          {/* Q3 — 2-D contour spectrograph */}
          <Pane rect={CONTOUR}>
            <Panel width={CONTOUR.w} height={CONTOUR.h} tag="CONTOUR" led={ledState}>
              {(c) => (<><ContourSpectrogram width={c.w} height={c.h} /><Scanlines /></>)}
            </Panel>
          </Pane>

          {/* Q4 — pole-zero (z-plane) LPC display */}
          <Pane rect={PZ}>
            <Panel width={PZ.w} height={PZ.h} tag="Z-PLANE" led={ledState}>
              {(c) => (<><PoleZero width={c.w} height={c.h} /><Scanlines /></>)}
            </Panel>
          </Pane>

          {/* right column — ARCHIVE */}
          <Pane rect={RACK}>
            <div style={{
              position: 'absolute', inset: 0, boxSizing: 'border-box',
              borderLeft: '1px solid #3a3a3a', background: '#000',
              display: 'flex', flexDirection: 'column', fontFamily: MONO,
            }}>
              <div style={{
                flex: '0 0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                padding: '5px 8px', borderBottom: '1px solid #3a3a3a',
                fontSize: 9, letterSpacing: '0.18em', color: 'rgba(220,220,220,0.8)',
              }}>
                <span>ARCHIVE</span>
                <span style={{ color: 'rgba(150,150,150,0.6)' }}>{playlist.length}</span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                <ArchiveRow led="error" live name="LIVE BROADCAST" date="on air now" dur="24/7" selected={liveSelected} onClick={onLive} />
                {playlist.map((m) => (
                  <ArchiveRow key={m.id}
                    led={m.kind === 'inter' ? 'idle' : 'live'}
                    name={m.title} date={m.date || m.artist} dur={m.duration}
                    selected={mode === 'individual' && currentTrack?.id === m.id}
                    onClick={() => onSelectClip(m)} />
                ))}
              </div>

              <div style={{ flex: '0 0 auto', borderTop: '1px solid #3a3a3a', padding: '6px 8px', fontSize: 9, lineHeight: '15px', color: 'rgba(210,210,210,0.8)' }}>
                {([
                  ['SRC', currentTrack ? currentTrack.title : liveSelected ? 'LIVE BROADCAST' : 'N/A'],
                  ['STAT', statusLabel],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex' }}>
                    <span style={{ width: 38, color: 'rgba(150,150,150,0.7)' }}>{k}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* transport — text-only with a blinking run indicator, no pill button */}
              <button onClick={onTransport} aria-label={isPlaying ? 'Stop' : 'Start'} style={{
                flex: '0 0 auto', width: '100%', background: 'transparent', border: 0,
                borderTop: '1px solid #3a3a3a', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em',
                color: isPlaying ? '#36e05a' : 'rgba(220,220,220,0.85)',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: isPlaying ? '#36e05a' : '#555',
                  boxShadow: isPlaying ? '0 0 5px #36e05a' : undefined,
                  animation: isPlaying ? 'vr-blink 1s step-end infinite' : undefined,
                }} />
                <span>{isPlaying ? 'RUNNING — STOP' : 'START'}</span>
              </button>
            </div>
          </Pane>
        </div>
      </div>
    </div>
  );
}

// --- helpers -----------------------------------------------------------------

function Pane({ rect, children }: { rect: { x: number; y: number; w: number; h: number }; children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxSizing: 'border-box' }}>
      {children}
    </div>
  );
}

// Startup graphic over the live monitor — a Hypersignal-style DSP boot sequence that
// covers the YouTube logo / play-button flash on load, then fades to reveal the stream.
function VideoBoot({ done }: { done: boolean }) {
  const lines = [
    'HYPERSIGNAL RIDE  v3.0',
    'DSP CORE ............ OK',
    'VIDEO CODEC  PAL .... OK',
    'ACQUIRING UPLINK ....',
    'AL-HADATH  SIGNAL  OK',
  ];
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0, background: '#000',
      opacity: done ? 0 : 1, transition: 'opacity 0.5s ease',
      pointerEvents: 'none', overflow: 'hidden', zIndex: 3,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 14px', gap: 3,
    }}>
      {lines.map((l, i) => (
        <span key={l} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', color: `rgb(${CYAN})`, opacity: 0.6 + i * 0.08 }}>
          {l}{i === lines.length - 1 && <span style={{ animation: 'vr-blink 0.8s step-end infinite' }}> ▮</span>}
        </span>
      ))}
      <div style={{ position: 'absolute', inset: 0, background: SCANLINES, opacity: 0.6, mixBlendMode: 'multiply' }} />
    </div>
  );
}

// Subtle CRT scanline + phosphor overlay — sells the "early computing" register
// without obscuring the instrument underneath.
function Scanlines() {
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: SCANLINES, opacity: 0.5, mixBlendMode: 'multiply',
    }} />
  );
}

function ArchiveRow({
  led, name, date, dur, selected, live, onClick,
}: {
  led: 'live' | 'idle' | 'error'; name: string; date: string; dur: string;
  selected: boolean; live?: boolean; onClick: () => void;
}) {
  const dot = led === 'error' ? '#e0433a' : led === 'idle' ? '#d8a23a' : '#36e05a';
  return (
    <button onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '8px 1fr auto', alignItems: 'center', gap: 6,
      width: '100%', textAlign: 'left', padding: '4px 8px', cursor: 'pointer',
      background: selected ? 'rgba(54,224,90,0.08)' : 'transparent',
      borderLeft: selected ? '2px solid #36e05a' : '2px solid transparent',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      fontFamily: MONO,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: dot,
        boxShadow: `0 0 3px ${dot}`, animation: live ? 'vrPulse 1.4s ease-in-out infinite' : undefined,
      }} />
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ color: selected ? '#daffda' : 'rgba(216,216,216,0.9)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ color: 'rgba(150,150,150,0.6)', fontSize: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{date}</span>
      </span>
      <span style={{ color: 'rgba(170,170,170,0.6)', fontSize: 8, whiteSpace: 'nowrap' }}>{dur}</span>
    </button>
  );
}
