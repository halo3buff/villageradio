'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useAudio } from '@/lib/audio-context';
import { MobileWaterfall } from '@/components/mobile/MobileWaterfall';
import { MobilePoleZero } from '@/components/mobile/MobilePoleZero';
import type { Mix } from '@/lib/types';

const SW = 402;
const SH = 874;

const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const RED = '#ff0000';

// Instrument panels — waterfall on top, LPC pole-zero below, archive list under both
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
  const [scale, setScale] = useState(1);
  const { isPlaying, mode, currentTrack, playlist, broadcastPlay, play, toggle } = useAudio();

  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / SW, window.innerHeight / SH));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: '#fff' }}>
      <div
        className="page-enter"
        style={{
          position: 'absolute', left: '50%', top: '50%', width: SW, height: SH,
          transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center center',
        }}
      >
        {/* Back arrow — 50×50 matching work page standard */}
        <Link href="/" style={{
          position: 'absolute', left: 17, top: 16, display: 'block',
          width: 50, height: 50,
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: 50, height: 50, objectFit: 'contain' }} />
        </Link>

        {/* WFALL label — top left of waterfall scope */}
        <div style={{
          position: 'absolute', left: WFALL_X + 7, top: WFALL_Y + 7, zIndex: 2, pointerEvents: 'none',
          fontFamily: BODY, fontSize: 11, lineHeight: '11px', textTransform: 'uppercase', color: '#000',
        }}>
          {'WFALL '}
          <span style={{ color: RED }}>[{live ? 'LIVE' : 'IDLE'}]</span>
          {live && <span style={{ color: RED, animation: 'vr-blink 1s step-end infinite' }}> █</span>}
        </div>

        {/* Waterfall scope — chromeless black-outline box, tap to toggle */}
        <div
          onClick={onLive}
          style={{
            position: 'absolute', left: WFALL_X, top: WFALL_Y, width: WFALL_W, height: WFALL_H,
            border: '1px solid #000', boxSizing: 'border-box', cursor: 'pointer', background: 'transparent',
          }}
        >
          <MobileWaterfall width={WFALL_W} height={WFALL_H} />

          {/* play/pause glyph — bottom-left */}
          <span style={{
            position: 'absolute', left: 8, bottom: 6, fontSize: 13, lineHeight: 1,
            color: '#000', pointerEvents: 'none',
          }}>
            {liveSelected && isPlaying ? '❚❚' : '▶'}
          </span>
        </div>

        {/* LPC POLE-ZERO label */}
        <div style={{
          position: 'absolute', left: WFALL_X + 7, top: LPC_Y + 7, zIndex: 2, pointerEvents: 'none',
          fontFamily: BODY, fontSize: 11, lineHeight: '11px', textTransform: 'uppercase', color: '#000',
        }}>
          {'LPC '}
          <span style={{ color: RED }}>[Z-PLANE]</span>
        </div>

        {/* LPC Pole-Zero scope */}
        <div style={{
          position: 'absolute', left: WFALL_X, top: LPC_Y, width: WFALL_W, height: LPC_H,
          border: '1px solid #000', boxSizing: 'border-box', background: 'transparent',
        }}>
          <MobilePoleZero width={WFALL_W} height={LPC_H} />
        </div>

        {/* ARCHIVE label */}
        <div style={{
          position: 'absolute', left: WFALL_X, top: ARCHIVE_Y,
          fontFamily: BODY, fontSize: 11, lineHeight: '11px', textTransform: 'uppercase', color: '#000',
        }}>
          ARCHIVE
        </div>

        {/* LIVE broadcast row */}
        <button
          onClick={onLive}
          style={{
            position: 'absolute', left: WFALL_X, top: ARCHIVE_Y + 18,
            width: WFALL_W, height: 32,
            background: liveSelected ? '#000' : 'transparent',
            border: '1px solid #000', boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 10,
            cursor: 'pointer',
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: live ? RED : 'transparent',
            border: `1px solid ${live ? RED : '#000'}`,
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: BODY, fontSize: 11, textTransform: 'uppercase', lineHeight: 1,
            color: liveSelected ? '#fff' : '#000',
          }}>
            {live && liveSelected ? 'LIVE — on air' : 'LIVE BROADCAST'}
          </span>
        </button>

        {/* Separator */}
        <div style={{
          position: 'absolute', left: WFALL_X, top: ARCHIVE_Y + 50,
          width: WFALL_W, height: 1, background: '#000', opacity: 0.15,
        }} />

        {/* Archive track list */}
        <div style={{
          position: 'absolute', left: WFALL_X, top: ARCHIVE_Y + 51,
          width: WFALL_W, height: SH - (ARCHIVE_Y + 51) - 10,
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
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', height: 26, paddingLeft: 10, paddingRight: 10,
                  background: isActive ? '#000' : 'transparent',
                  border: 'none', borderBottom: '1px solid rgba(0,0,0,0.08)',
                  cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                }}
              >
                <span style={{
                  fontFamily: BODY, fontSize: 9, letterSpacing: '0.1em',
                  color: isActive ? '#fff' : 'rgba(0,0,0,0.35)',
                  minWidth: 16, textAlign: 'right',
                }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{
                  fontFamily: BODY, fontSize: 11, textTransform: 'uppercase', lineHeight: 1,
                  color: isActive ? '#fff' : '#000',
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {track.title}
                </span>
                {isPlayingClip && (
                  <span style={{ fontSize: 9, color: '#fff', letterSpacing: '0.1em' }}>▶</span>
                )}
              </button>
            );
          })}
        </div>

        {/* CRT scanlines */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none',
          background: SCANLINES, opacity: 0.6,
        }} />
      </div>
    </div>
  );
}
