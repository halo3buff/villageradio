'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRef, useEffect } from 'react';
import { useAudio } from '@/lib/audio-context';
import { useTheme } from '@/components/ThemeProvider';
import { LIGHT_THEMES } from '@/lib/theme';
import { MobileWaterfall } from '@/components/mobile/MobileWaterfall';
import { MobilePoleZero } from '@/components/mobile/MobilePoleZero';
import type { Mix } from '@/lib/types';

const SW = 402;
const SH = 874;
const vw = (n: number) => `${(n / SW * 100).toFixed(2)}vw`;
const dvh = (n: number) => `${(n / SH * 100).toFixed(2)}dvh`;

const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const RED = '#ff0000';

// theme tokens — page chrome follows the site theme
const BG     = 'var(--vlg-bg, #fff)';
const STRONG = 'var(--vlg-strong, #000)';
const ink = (pct: number) => `color-mix(in srgb, var(--vlg-strong, #000) ${pct}%, transparent)`;

const WFALL_X = 17;
const WFALL_W = 368;
const WFALL_Y = 82;
const WFALL_H = 205;
const LPC_Y = WFALL_Y + WFALL_H + 6;
const LPC_H = 205;
const SCRUB_Y = LPC_Y + LPC_H + 6;  // scrub bar top (design px)
const SCRUB_H = 22;                   // room for line + time labels
const ARCHIVE_Y = LPC_Y + LPC_H + 36;

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.10) 3px)';

function z2(n: number) { return String(Math.floor(n)).padStart(2, '0'); }
function mmss(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${z2(Math.floor(s / 60))}:${z2(s % 60)}`;
}

export function MobileListen() {
  const { isPlaying, mode, currentTrack, playlist, broadcastPlay, play, toggle, progress } = useAudio();
  const { name: themeName } = useTheme();
  const lightTheme = LIGHT_THEMES.has(themeName);
  const plotEdge  = lightTheme ? STRONG : 'rgba(255,0,255,0.7)';
  const plotLabel = lightTheme ? '#000' : '#ffff00';

  const onLive = () => {
    if (mode === 'broadcast' && isPlaying) toggle();
    else broadcastPlay();
  };

  const onSelectClip = (track: Mix) => {
    if (mode === 'individual' && currentTrack?.id === track.id) toggle();
    else play(track);
  };

  const live = isPlaying && mode !== 'idle';
  const liveSelected = mode === 'broadcast';

  // Derive the current TX label for the nameplate rail
  const txIdx = currentTrack ? playlist.findIndex(t => t.id === currentTrack.id) : -1;
  const txLabel = mode === 'broadcast'
    ? 'TX-LIVE'
    : txIdx >= 0
      ? `TX-${String(txIdx + 1).padStart(3, '0')}`
      : '—';

  // Ticking UTC clock — updated imperatively so no re-renders
  const clockRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => {
      if (!clockRef.current) return;
      const d = new Date();
      clockRef.current.textContent = `${z2(d.getUTCHours())}:${z2(d.getUTCMinutes())}:${z2(d.getUTCSeconds())} UTC`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // RX session timer — starts fresh each time the live broadcast is tuned in
  const sessionStartRef = useRef(0);
  const sessionSpanRef = useRef<HTMLSpanElement>(null);
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, overflow: 'hidden', background: BG }}>
      <div className="page-enter" style={{ position: 'absolute', inset: 0 }}>

        {/* Nameplate rail — matches desktop VLG-4CH strip */}
        <div style={{
          position: 'absolute', left: 0, top: 0, right: 0, height: dvh(20),
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `0 ${vw(WFALL_X)}`,
          borderBottom: `1px solid ${ink(18)}`,
          fontFamily: BODY, fontSize: vw(8), letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          <span style={{ color: STRONG }}>VLG-RX</span>
          <span style={{ color: ink(40) }}>{txLabel}</span>
          <span ref={clockRef} style={{ color: STRONG }} />
        </div>

        {/* Back arrow */}
        <Link href="/" style={{
          position: 'absolute', left: vw(WFALL_X), top: dvh(24), display: 'block',
          width: vw(50), height: vw(50),
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: vw(50), height: vw(50), objectFit: 'contain' }} />
        </Link>

        {/* WFALL label */}
        <div style={{
          position: 'absolute', left: vw(WFALL_X + 7), top: dvh(WFALL_Y + 7), zIndex: 2, pointerEvents: 'none',
          fontFamily: BODY, fontSize: vw(11), lineHeight: dvh(11), textTransform: 'uppercase', color: plotLabel,
        }}>
          {'WFALL '}
          <span style={{ color: RED }}>[{live ? 'LIVE' : 'IDLE'}]</span>
          {live && (
            <span style={{
              display: 'inline-block', width: '0.6em', height: '0.75em',
              background: RED, verticalAlign: '-0.1em', marginLeft: '0.2em',
              animation: 'vr-blink 1s step-end infinite',
            }} />
          )}
        </div>

        {/* Waterfall scope */}
        <div
          onClick={onLive}
          style={{
            position: 'absolute', left: vw(WFALL_X), top: dvh(WFALL_Y),
            width: vw(WFALL_W), height: dvh(WFALL_H),
            border: `1px solid ${plotEdge}`, boxSizing: 'border-box', cursor: 'pointer', background: 'transparent',
          }}
        >
          <MobileWaterfall />
          {/* Glyph-free play/pause — text chars render as emoji on iOS */}
          <span style={{
            position: 'absolute', left: 8, bottom: 6, lineHeight: 1, pointerEvents: 'none',
          }}>
            {liveSelected && isPlaying ? (
              <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
                <rect x="0" y="0" width="3" height="12" fill={plotLabel} />
                <rect x="6" y="0" width="3" height="12" fill={plotLabel} />
              </svg>
            ) : (
              <svg width="9" height="12" viewBox="0 0 9 12" aria-hidden>
                <polygon points="0,0 0,12 9,6" fill={plotLabel} />
              </svg>
            )}
          </span>
        </div>

        {/* LPC POLE-ZERO label */}
        <div style={{
          position: 'absolute', left: vw(WFALL_X + 7), top: dvh(LPC_Y + 7), zIndex: 2, pointerEvents: 'none',
          fontFamily: BODY, fontSize: vw(11), lineHeight: dvh(11), textTransform: 'uppercase', color: plotLabel,
        }}>
          {'LPC '}
          <span style={{ color: RED }}>[Z-PLANE]</span>
        </div>

        {/* LPC Pole-Zero scope */}
        <div style={{
          position: 'absolute', left: vw(WFALL_X), top: dvh(LPC_Y),
          width: vw(WFALL_W), height: dvh(LPC_H),
          border: `1px solid ${plotEdge}`, boxSizing: 'border-box', background: 'transparent',
        }}>
          <MobilePoleZero />
        </div>

        {/* Scrub bar — visible when an archive clip is loaded */}
        {mode === 'individual' && currentTrack && (() => {
          const dur = currentTrack.durationSec ?? 0;
          const elapsed = dur > 0 ? progress * dur : 0;
          const remaining = dur > 0 ? dur - elapsed : 0;
          return (
            <div style={{
              position: 'absolute', left: vw(WFALL_X), top: dvh(SCRUB_Y),
              width: vw(WFALL_W), height: dvh(SCRUB_H),
            }}>
              {/* dithered track line */}
              <div style={{
                position: 'absolute', left: 0, right: 0, top: dvh(4), height: 1,
                background: `repeating-linear-gradient(90deg, ${ink(20)} 0px, ${ink(20)} 1px, transparent 1px, transparent 3px)`,
              }} />
              {/* solid played portion */}
              <div style={{
                position: 'absolute', left: 0, top: dvh(4), height: 1,
                width: `${progress * 100}%`,
                background: STRONG,
              }} />
              {/* playhead cursor */}
              <div style={{
                position: 'absolute', top: dvh(1), bottom: dvh(5),
                left: `${progress * 100}%`,
                width: 1,
                background: STRONG,
                transform: 'translateX(-50%)',
              }} />
              {/* time labels */}
              <div style={{
                position: 'absolute', left: 0, right: 0, top: dvh(10),
                display: 'flex', justifyContent: 'space-between',
                fontFamily: BODY, fontSize: vw(7.5), color: ink(40),
                letterSpacing: '0.05em',
              }}>
                <span>{mmss(elapsed)}</span>
                <span>{dur > 0 ? `-${mmss(remaining)}` : '—'}</span>
              </div>
            </div>
          );
        })()}

        {/* TX LOG label */}
        <div style={{
          position: 'absolute', left: vw(WFALL_X), top: dvh(ARCHIVE_Y),
          fontFamily: BODY, fontSize: vw(11), lineHeight: dvh(11), textTransform: 'uppercase', color: STRONG,
        }}>
          TX LOG
        </div>

        {/* TX-LIVE broadcast row */}
        <button
          onClick={onLive}
          style={{
            position: 'absolute', left: vw(WFALL_X), top: dvh(ARCHIVE_Y + 18),
            width: vw(WFALL_W), height: dvh(36),
            background: liveSelected ? STRONG : 'transparent',
            border: `1px solid ${STRONG}`, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', gap: vw(8), paddingLeft: vw(10),
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{
            width: vw(7), height: vw(7), borderRadius: '50%',
            background: live ? RED : 'transparent',
            border: `1px solid ${live ? RED : (liveSelected ? BG : STRONG)}`,
            flexShrink: 0,
            animation: live && liveSelected ? 'vrPulse 1.4s ease-in-out infinite' : undefined,
          }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: vw(3) }}>
            <span style={{
              fontFamily: BODY, fontSize: vw(11), textTransform: 'uppercase', lineHeight: 1,
              color: liveSelected ? BG : STRONG,
            }}>
              TX-LIVE
            </span>
            <span style={{
              fontFamily: BODY, fontSize: vw(8), textTransform: 'uppercase', lineHeight: 1,
              color: liveSelected
                ? (live ? RED : `color-mix(in srgb, ${BG} 45%, transparent)`)
                : (live ? RED : ink(35)),
            }}>
              {live && liveSelected ? 'RECEIVING' : 'STANDBY'}
            </span>
            {/* Session RX counter — always in DOM so sessionSpanRef stays attached */}
            <span ref={sessionSpanRef} style={{
              fontFamily: BODY, fontSize: vw(7), textTransform: 'uppercase', lineHeight: 1,
              color: `color-mix(in srgb, ${BG} 35%, transparent)`,
              display: live && liveSelected ? 'block' : 'none',
            }} />
          </span>
        </button>

        {/* Separator */}
        <div style={{
          position: 'absolute', left: vw(WFALL_X), top: dvh(ARCHIVE_Y + 54),
          width: vw(WFALL_W), height: 1, background: STRONG, opacity: 0.15,
        }} />

        {/* Archive track list — stretches to bottom */}
        <div style={{
          position: 'absolute',
          left: vw(WFALL_X), top: dvh(ARCHIVE_Y + 55),
          width: vw(WFALL_W), bottom: dvh(10),
          overflowY: 'auto',
        }}>
          {playlist.map((track, i) => {
            const isActive = currentTrack?.id === track.id;
            const isPlayingClip = isActive && isPlaying && mode === 'individual';
            const c = (active: boolean) => active ? STRONG : ink(32);
            const status = isPlayingClip ? 'TX' : isActive ? 'LOADED' : 'STANDBY';
            return (
              <button
                key={track.id}
                onClick={() => onSelectClip(track)}
                style={{
                  display: 'flex', alignItems: 'center', gap: vw(3),
                  width: '100%', height: dvh(26),
                  paddingLeft: vw(10), paddingRight: vw(10),
                  background: 'transparent',
                  border: 'none', borderBottom: `1px solid ${ink(6)}`,
                  cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                  fontFamily: MONO, fontSize: vw(9.5), lineHeight: 1,
                }}
              >
                {/* Caret — visible only when selected */}
                <span style={{
                  flexShrink: 0, width: vw(8), color: RED,
                  visibility: isActive ? 'visible' : 'hidden',
                }}>{'>'}</span>

                {/* TX ID */}
                <span style={{ flexShrink: 0, minWidth: vw(36), color: c(isActive) }}>
                  TX-{String(i + 1).padStart(3, '0')}
                </span>

                {/* Title */}
                <span style={{
                  overflow: 'hidden', whiteSpace: 'nowrap',
                  flexShrink: 1, minWidth: 0,
                  color: c(isActive),
                }}>
                  {track.title.toUpperCase()}
                </span>

                {/* Dot leaders */}
                <span style={{
                  flex: 1, minWidth: vw(8),
                  borderBottom: `1px dotted ${ink(22)}`,
                  alignSelf: 'flex-end', marginBottom: '3px',
                }} />

                {/* Duration */}
                {track.duration && (
                  <span style={{
                    flexShrink: 0, fontSize: vw(8.5),
                    color: isActive ? ink(55) : ink(28),
                  }}>
                    {track.duration}
                  </span>
                )}

                {/* Status word */}
                <span style={{
                  flexShrink: 0, fontSize: vw(8), textTransform: 'uppercase',
                  color: isPlayingClip ? RED : c(isActive),
                  minWidth: vw(44), textAlign: 'right',
                }}>
                  {status}
                </span>
              </button>
            );
          })}
        </div>

      </div>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 1010, pointerEvents: 'none',
        background: SCANLINES, opacity: 0.6,
      }} />
    </div>
  );
}
