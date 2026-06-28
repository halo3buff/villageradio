'use client';

import { useRef, useEffect, useState } from 'react';
import { MONO, CYAN } from './retro';

/**
 * Al-Hadath live video — a plain HTML5 <video> fed the channel's direct HLS feed.
 *
 * No YouTube embed, so there is NO player chrome to hide: just the picture. The
 * Al Arabiya CDN serves the master playlist, variant playlists and .ts segments all
 * with `Access-Control-Allow-Origin: *`, so hls.js can fetch them straight from the
 * browser with no proxy. Safari plays HLS natively; everything else uses hls.js.
 *
 * Carries an on-screen diagnostic readout (state + resolution + presented-frame count)
 * so a black pane is never a silent mystery — we can see whether frames are decoding.
 */

const HLS_SRC = 'https://live.alarabiya.net/alarabiapublish/alhadath.smil/playlist.m3u8';

export function LiveVideo({ onReady }: { onReady?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [status, setStatus] = useState('INIT');
  const [dims, setDims] = useState('—');
  const [frames, setFrames] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: import('hls.js').default | null = null;
    let cancelled = false;
    let frameCount = 0;

    video.muted = true;
    video.defaultMuted = true;

    const tryPlay = () => {
      video.play()
        .then(() => { if (!cancelled) setStatus('PLAYING'); })
        .catch((e) => { if (!cancelled) setStatus(`AUTOPLAY BLOCKED: ${e?.name || e}`); });
    };

    // count actually-presented video frames — the ground truth for "is there a picture"
    type VideoWithRVFC = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    const v = video as VideoWithRVFC;
    const onFrame = () => {
      if (cancelled) return;
      frameCount++;
      if (frameCount === 1 || frameCount % 10 === 0) {
        setFrames(frameCount);
        setDims(`${video.videoWidth}×${video.videoHeight}`);
      }
      if (frameCount === 2) onReadyRef.current?.(); // real picture confirmed
      v.requestVideoFrameCallback?.(onFrame);
    };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(onFrame);

    video.addEventListener('loadedmetadata', () => { if (!cancelled) setDims(`${video.videoWidth}×${video.videoHeight}`); });
    video.addEventListener('playing', () => { if (!cancelled) setStatus('PLAYING'); });
    video.addEventListener('waiting', () => { if (!cancelled) setStatus('BUFFERING…'); });
    video.addEventListener('stalled', () => { if (!cancelled) setStatus('STALLED'); });

    const startNative = () => {
      setStatus('NATIVE HLS…');
      video.src = HLS_SRC;
      video.addEventListener('loadeddata', tryPlay, { once: true });
      video.addEventListener('error', () => { if (!cancelled) setStatus('VIDEO ERROR (native)'); });
    };

    // Prefer hls.js whenever it's supported (MSE) — many desktop browsers report a
    // false-positive "maybe" for native HLS but can't actually decode it. Native HLS
    // (Safari/iOS, where MSE-based hls.js isn't supported) is the fallback.
    setStatus('LOADING hls.js…');
    import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;
      if (Hls.isSupported()) {
        setStatus('CONNECTING…');
        hls = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
        hls.loadSource(HLS_SRC);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { setStatus('MANIFEST OK'); tryPlay(); });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!cancelled) setStatus(`HLS ${data.type}/${data.details}${data.fatal ? ' (FATAL)' : ''}`);
          if (!data.fatal || !hls) return;
          if (data.type === 'networkError') hls.startLoad();
          else if (data.type === 'mediaError') hls.recoverMediaError();
          else hls.destroy();
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        startNative();
      } else {
        setStatus('NO HLS SUPPORT');
      }
    }).catch((e) => {
      // hls.js failed to load — fall back to native if the browser allows it
      if (video.canPlayType('application/vnd.apple.mpegurl')) startNative();
      else setStatus(`hls.js IMPORT FAILED: ${e?.message || e}`);
    });

    return () => {
      cancelled = true;
      if (hls) hls.destroy();
      video.removeAttribute('src');
    };
  }, []);

  const hasPicture = frames >= 2;

  return (
    <>
      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.02)', background: '#000', pointerEvents: 'none' }}
      />
      {/* persistent diagnostic badge — stays up even once playing so state is readable */}
      <div aria-hidden style={{
        position: 'absolute', left: 4, bottom: 3, zIndex: 9, pointerEvents: 'none',
        fontFamily: MONO, fontSize: 8, letterSpacing: '0.04em',
        color: hasPicture ? 'rgba(54,224,90,0.85)' : `rgb(${CYAN})`,
        background: 'rgba(0,0,0,0.5)', padding: '1px 4px',
      }}>
        RX {status} · {dims} · f{frames}
      </div>
      {!hasPicture && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: 'rgba(0,0,0,0.7)',
        }}>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.5)' }}>RX STATUS</span>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, letterSpacing: '0.05em', textAlign: 'center', color: `rgb(${CYAN})`, padding: '0 12px', lineHeight: 1.4 }}>{status}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(200,200,200,0.6)' }}>{dims} · frames {frames}</span>
        </div>
      )}
    </>
  );
}
