'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRef, useEffect, useState } from 'react';
import { useAudio } from '@/lib/audio-context';
import type { Mix } from '@/lib/types';
import { LiveVideo } from '@/components/instruments/LiveVideo';
import { Panel } from '@/components/instruments/Panel';
import { MONO, CYAN, SCANLINES } from '@/components/instruments/retro';
import { MobileWaterfall } from '@/components/mobile/MobileWaterfall';
import { MobilePoleZero } from '@/components/mobile/MobilePoleZero';
import { MobileScope } from '@/components/mobile/MobileScope';

const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const RED  = '#ff0000';

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

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

  // RX session timer — same logic as mobile listen page
  const sessionStartRef = useRef(0);
  const sessionSpanRef  = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (mode !== 'broadcast' || !isPlaying) {
      if (sessionSpanRef.current) sessionSpanRef.current.textContent = '';
      return;
    }
    sessionStartRef.current = Date.now();
    const tick = () => {
      if (!sessionSpanRef.current) return;
      const s = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      sessionSpanRef.current.textContent = `SESSION RX ${mmss(s)}`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mode, isPlaying]);

  // ---- archive selection ----
  const onLive = () => { if (mode === 'broadcast' && isPlaying) toggle(); else broadcastPlay(); };
  const onSelectClip = (track: Mix) => {
    if (mode === 'individual' && currentTrack?.id === track.id) toggle();
    else play(track);
  };

  const live = isPlaying && mode !== 'idle';
  const liveSelected = mode === 'broadcast';
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

        <div style={{ position: 'absolute', left: EQ.x, top: EQ.y, width: EQ.w, height: EQ.h, background: '#fff', border: '1px solid rgba(0,0,0,0.14)', boxSizing: 'border-box', userSelect: 'none' }}>
          {/* unified nameplate rail */}
          <div style={{
            position: 'absolute', left: 0, top: 0, width: EQ.w, height: RAIL_H,
            display: 'flex', alignItems: 'center', gap: 14, padding: '0 10px',
            borderBottom: '1px solid rgba(0,0,0,0.12)', boxSizing: 'border-box',
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', color: 'rgba(0,0,0,0.5)',
            background: '#fff',
          }}>
            <span style={{ color: '#000' }}>VLG-4CH</span>
            <span style={{ color: 'rgba(0,0,0,0.4)' }}>SIGNAL ANALYZER</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: live ? RED : 'transparent',
                border: `1px solid ${live ? RED : 'rgba(0,0,0,0.3)'}`,
                animation: live ? 'vrPulse 1.6s ease-in-out infinite' : undefined,
              }} />
              <span style={{ color: live ? RED : 'rgba(0,0,0,0.4)' }}>{live ? 'LIVE' : 'IDLE'}</span>
            </span>
            <span ref={clockRef} style={{ color: '#000', letterSpacing: '0.1em' }}>01:00:00:00</span>
          </div>

          {/* Q1 — Al-Hadath video monitor (kept dark — video needs black bg) */}
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

          {/* Q2 — frequency waterfall (mobile aesthetic: white/black) */}
          <Pane rect={WFALL}>
            <div style={{ position: 'absolute', inset: 0, background: '#fff', border: '1px solid rgba(0,0,0,0.12)', boxSizing: 'border-box' }}>
              <div style={{
                position: 'absolute', left: 8, top: 5, zIndex: 2, pointerEvents: 'none',
                fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#000',
              }}>
                {'WFALL '}
                <span style={{ color: RED }}>[{live ? 'LIVE' : 'IDLE'}]</span>
              </div>
              <MobileWaterfall />
              <Scanlines />
            </div>
          </Pane>

          {/* Q3 — LPC pole-zero Z-plane (mobile aesthetic) */}
          <Pane rect={CONTOUR}>
            <div style={{ position: 'absolute', inset: 0, background: '#fff', border: '1px solid rgba(0,0,0,0.12)', boxSizing: 'border-box' }}>
              <div style={{
                position: 'absolute', left: 8, top: 5, zIndex: 2, pointerEvents: 'none',
                fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#000',
              }}>
                {'LPC '}
                <span style={{ color: RED }}>[Z-PLANE]</span>
              </div>
              <MobilePoleZero />
              <Scanlines />
            </div>
          </Pane>

          {/* Q4 — vectorscope / Lissajous (mobile aesthetic) */}
          <Pane rect={PZ}>
            <div style={{ position: 'absolute', inset: 0, background: '#fff', border: '1px solid rgba(0,0,0,0.12)', boxSizing: 'border-box' }}>
              <div style={{
                position: 'absolute', left: 8, top: 5, zIndex: 2, pointerEvents: 'none',
                fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#000',
              }}>
                {'SCOPE '}
                <span style={{ color: RED }}>[{live ? 'LIVE' : 'IDLE'}]</span>
              </div>
              <MobileScope />
              <Scanlines />
            </div>
          </Pane>

          {/* right column — TX LOG */}
          <Pane rect={RACK}>
            <div style={{
              position: 'absolute', inset: 0, boxSizing: 'border-box',
              borderLeft: '1px solid rgba(0,0,0,0.12)', background: '#fff',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* TX LOG header */}
              <div style={{
                flex: '0 0 auto', padding: '5px 8px',
                borderBottom: '1px solid rgba(0,0,0,0.1)',
                fontFamily: BODY, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
                color: '#000',
              }}>
                TX LOG
              </div>

              {/* TX-LIVE row */}
              <button onClick={onLive} style={{
                flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 8px',
                background: liveSelected ? '#000' : 'transparent',
                border: 'none', borderBottom: '1px solid rgba(0,0,0,0.1)',
                cursor: 'pointer', textAlign: 'left', fontFamily: BODY,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                  background: live ? RED : 'transparent',
                  border: `1px solid ${live ? RED : (liveSelected ? '#fff' : '#000')}`,
                  animation: live && liveSelected ? 'vrPulse 1.4s ease-in-out infinite' : undefined,
                }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, color: liveSelected ? '#fff' : '#000' }}>
                    TX-LIVE
                  </span>
                  <span style={{
                    fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1,
                    color: liveSelected ? (live ? RED : 'rgba(255,255,255,0.45)') : (live ? RED : 'rgba(0,0,0,0.4)'),
                  }}>
                    {live && liveSelected ? 'RECEIVING' : 'STANDBY'}
                  </span>
                  <span ref={sessionSpanRef} style={{
                    fontSize: 7, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1,
                    color: 'rgba(255,255,255,0.35)',
                    display: live && liveSelected ? 'block' : 'none',
                  }} />
                </span>
              </button>

              {/* Separator */}
              <div style={{ flex: '0 0 auto', height: 1, background: 'rgba(0,0,0,0.08)' }} />

              {/* Archive track list */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {playlist.map((m, i) => {
                  const isActive = mode === 'individual' && currentTrack?.id === m.id;
                  const isPlayingClip = isActive && isPlaying;
                  const DIM  = 'rgba(0,0,0,0.32)';
                  const FULL = '#000';
                  const c = (a: boolean) => a ? FULL : DIM;
                  const status = isPlayingClip ? 'TX' : isActive ? 'LOADED' : 'STANDBY';
                  return (
                    <button key={m.id} onClick={() => onSelectClip(m)} style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      width: '100%', height: 24,
                      paddingLeft: 6, paddingRight: 6,
                      background: 'transparent',
                      border: 'none', borderBottom: '1px solid rgba(0,0,0,0.05)',
                      cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                      fontFamily: MONO, fontSize: 8.5, lineHeight: 1,
                    }}>
                      <span style={{ flexShrink: 0, width: 7, color: RED, visibility: isActive ? 'visible' : 'hidden' }}>{'>'}</span>
                      <span style={{ flexShrink: 0, minWidth: 32, color: c(isActive) }}>TX-{String(i + 1).padStart(3, '0')}</span>
                      <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0, color: c(isActive) }}>
                        {m.title.toUpperCase()}
                      </span>
                      <span style={{
                        flex: 1, minWidth: 5,
                        borderBottom: '1px dotted rgba(0,0,0,0.22)',
                        alignSelf: 'flex-end', marginBottom: 2,
                      }} />
                      <span style={{
                        flexShrink: 0, fontSize: 7.5,
                        color: isPlayingClip ? RED : c(isActive),
                        minWidth: 36, textAlign: 'right',
                      }}>
                        {status}
                      </span>
                    </button>
                  );
                })}
              </div>
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

