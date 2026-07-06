'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAudio } from '@/lib/audio-context';
import { MobileWaterfall } from '@/components/mobile/MobileWaterfall';
import { MobilePoleZero } from '@/components/mobile/MobilePoleZero';
import type { Mix } from '@/lib/types';

const SW = 402;
const SH = 874;
const vw = (n: number) => `${(n / SW * 100).toFixed(2)}vw`;
const dvh = (n: number) => `${(n / SH * 100).toFixed(2)}dvh`;

// All listen-page text uses the info/README-page face (IBM Plex Mono),
// matching the axis labels the scope canvases already draw in mono.
const BODY = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const RED = '#ff0000';

const WFALL_X = 17;
const WFALL_W = 368;
const WFALL_Y = 82;
const WFALL_H = 185;
const LPC_Y = WFALL_Y + WFALL_H + 6;
const LPC_H = 185;
const ARCHIVE_Y = LPC_Y + LPC_H + 14;

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.10) 3px)';

export function MobileListen() {
  const { isPlaying, mode, currentTrack, playlist, broadcastPlay, play, toggle } = useAudio();

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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, overflow: 'hidden', background: '#fff' }}>
      <div className="page-enter" style={{ position: 'absolute', inset: 0 }}>

        {/* Back arrow */}
        <Link href="/" style={{
          position: 'absolute', left: vw(WFALL_X), top: dvh(16), display: 'block',
          width: vw(50), height: vw(50),
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: vw(50), height: vw(50), objectFit: 'contain' }} />
        </Link>

        {/* WFALL label */}
        <div style={{
          position: 'absolute', left: vw(WFALL_X + 7), top: dvh(WFALL_Y + 7), zIndex: 2, pointerEvents: 'none',
          fontFamily: BODY, fontSize: vw(11), lineHeight: dvh(11), textTransform: 'uppercase', color: '#000',
        }}>
          {'WFALL '}
          <span style={{ color: RED }}>[{live ? 'LIVE' : 'IDLE'}]</span>
          {live && <span style={{ color: RED, animation: 'vr-blink 1s step-end infinite' }}> █</span>}
        </div>

        {/* Waterfall scope */}
        <div
          onClick={onLive}
          style={{
            position: 'absolute', left: vw(WFALL_X), top: dvh(WFALL_Y),
            width: vw(WFALL_W), height: dvh(WFALL_H),
            border: '1px solid #000', boxSizing: 'border-box', cursor: 'pointer', background: 'transparent',
          }}
        >
          <MobileWaterfall />
          {/* Glyph-free play/pause — text chars render as emoji on iOS */}
          <span style={{
            position: 'absolute', left: 8, bottom: 6, lineHeight: 1, pointerEvents: 'none',
          }}>
            {liveSelected && isPlaying ? (
              <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
                <rect x="0" y="0" width="3" height="12" fill="#000" />
                <rect x="6" y="0" width="3" height="12" fill="#000" />
              </svg>
            ) : (
              <svg width="9" height="12" viewBox="0 0 9 12" aria-hidden>
                <polygon points="0,0 0,12 9,6" fill="#000" />
              </svg>
            )}
          </span>
        </div>

        {/* LPC POLE-ZERO label */}
        <div style={{
          position: 'absolute', left: vw(WFALL_X + 7), top: dvh(LPC_Y + 7), zIndex: 2, pointerEvents: 'none',
          fontFamily: BODY, fontSize: vw(11), lineHeight: dvh(11), textTransform: 'uppercase', color: '#000',
        }}>
          {'LPC '}
          <span style={{ color: RED }}>[Z-PLANE]</span>
        </div>

        {/* LPC Pole-Zero scope */}
        <div style={{
          position: 'absolute', left: vw(WFALL_X), top: dvh(LPC_Y),
          width: vw(WFALL_W), height: dvh(LPC_H),
          border: '1px solid #000', boxSizing: 'border-box', background: 'transparent',
        }}>
          <MobilePoleZero />
        </div>

        {/* ARCHIVE label */}
        <div style={{
          position: 'absolute', left: vw(WFALL_X), top: dvh(ARCHIVE_Y),
          fontFamily: BODY, fontSize: vw(11), lineHeight: dvh(11), textTransform: 'uppercase', color: '#000',
        }}>
          ARCHIVE
        </div>

        {/* LIVE broadcast row */}
        <button
          onClick={onLive}
          style={{
            position: 'absolute', left: vw(WFALL_X), top: dvh(ARCHIVE_Y + 18),
            width: vw(WFALL_W), height: dvh(32),
            background: liveSelected ? '#000' : 'transparent',
            border: '1px solid #000', boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', gap: vw(8), paddingLeft: vw(10),
            cursor: 'pointer',
          }}
        >
          <span style={{
            width: vw(7), height: vw(7), borderRadius: '50%',
            background: live ? RED : 'transparent',
            border: `1px solid ${live ? RED : '#000'}`,
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: BODY, fontSize: vw(11), textTransform: 'uppercase', lineHeight: 1,
            color: liveSelected ? '#fff' : '#000',
          }}>
            {live && liveSelected ? 'LIVE — on air' : 'LIVE BROADCAST'}
          </span>
        </button>

        {/* Separator */}
        <div style={{
          position: 'absolute', left: vw(WFALL_X), top: dvh(ARCHIVE_Y + 50),
          width: vw(WFALL_W), height: 1, background: '#000', opacity: 0.15,
        }} />

        {/* Archive track list — stretches to bottom */}
        <div style={{
          position: 'absolute',
          left: vw(WFALL_X), top: dvh(ARCHIVE_Y + 51),
          width: vw(WFALL_W), bottom: dvh(10),
          overflowY: 'auto',
        }}>
          {playlist.map((track, i) => {
            const isActive = currentTrack?.id === track.id;
            const isPlayingClip = isActive && isPlaying && mode === 'individual';
            return (
              <button
                key={track.id}
                onClick={() => onSelectClip(track)}
                style={{
                  display: 'flex', alignItems: 'center', gap: vw(10),
                  width: '100%', height: dvh(26), paddingLeft: vw(10), paddingRight: vw(10),
                  background: isActive ? '#000' : 'transparent',
                  border: 'none', borderBottom: '1px solid rgba(0,0,0,0.08)',
                  cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                }}
              >
                <span style={{
                  fontFamily: BODY, fontSize: vw(9), letterSpacing: '0.1em',
                  color: isActive ? '#fff' : 'rgba(0,0,0,0.35)',
                  minWidth: vw(16), textAlign: 'right',
                }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{
                  fontFamily: BODY, fontSize: vw(11), textTransform: 'uppercase', lineHeight: 1,
                  color: isActive ? '#fff' : '#000',
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {track.title}
                </span>
                {isPlayingClip && (
                  <svg width="7" height="9" viewBox="0 0 7 9" aria-hidden style={{ flexShrink: 0 }}>
                    <polygon points="0,0 0,9 7,4.5" fill="#fff" />
                  </svg>
                )}
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
