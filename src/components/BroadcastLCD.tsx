'use client';

import { useRef, useEffect, useState } from 'react';
import { useAudio } from '@/lib/audio-context';
import { BroadcastLiveTag } from '@/components/BroadcastLiveTag';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const DSEG7 = "var(--font-dseg7), monospace";
const DSEG14 = "var(--font-dseg14), monospace";

const IDLE = '0.0000';
const DEAD = '-.----';
const GHOST = '8.8888';   // every segment lit — the unlit-glass underlay
const HZ_HI = 12000;

/**
 * BroadcastLCD — the live broadcast as a bench-instrument frequency counter
 * (reference: Screenshot 2026-07-14 012549.png, re-inked in the site's
 * monochrome). Set in DSEG7/DSEG14 Classic Italic — the actual segmented
 * LCD faces — with a full-lit ghost layer underneath like real glass. The
 * display reads the signal's spectral centroid in MHz: six figures of
 * precision for a broadcast that never leaves the noise floor of the dial.
 * Above it: the broadcast tag, the transport, and station time.
 */
export function BroadcastLCD({ counter = true }: { counter?: boolean } = {}) {
  const { isPlaying, mode, carrierLost, broadcastPlay, pause, analyserFreq } = useAudio();
  const isBroadcasting = mode === 'broadcast' && isPlaying;

  const liveRef = useRef(false);
  useEffect(() => { liveRef.current = isBroadcasting; }, [isBroadcasting]);
  const deadRef = useRef(false);
  useEffect(() => { deadRef.current = carrierLost; }, [carrierLost]);
  const freqRef = useRef<AnalyserNode | null>(null);
  useEffect(() => { freqRef.current = analyserFreq; }, [analyserFreq]);

  const valueRef = useRef<HTMLSpanElement>(null);
  const specRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(1024));
  const smoothRef = useRef(0);

  const [clock, setClock] = useState('--:--:-- UTC');
  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().slice(11, 19) + ' UTC');
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!counter) return;
    let raf = 0;
    const loop = () => {
      const el = valueRef.current;
      if (el) {
        let str = IDLE;
        if (deadRef.current) {
          str = DEAD;
        } else if (liveRef.current && freqRef.current) {
          const a = freqRef.current;
          if (specRef.current.length !== a.frequencyBinCount) {
            specRef.current = new Uint8Array(a.frequencyBinCount);
          }
          const spec = specRef.current;
          a.getByteFrequencyData(spec);
          const hzPerBin = a.context.sampleRate / 2 / spec.length;
          let num = 0, den = 0;
          for (let i = 1; i < spec.length; i++) { num += i * hzPerBin * spec[i]; den += spec[i]; }
          const centroid = den > 0 ? num / den : 0;
          smoothRef.current += (centroid - smoothRef.current) * 0.10;
          str = (Math.min(HZ_HI, smoothRef.current) / 1e6).toFixed(4);
        } else {
          smoothRef.current = 0;
        }
        if (el.textContent !== str) el.textContent = str;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [counter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'auto' }}>
      <div style={{
        fontFamily: MONO, fontSize: 11, lineHeight: '14px', letterSpacing: '0.04em',
        textTransform: 'uppercase', color: 'var(--vlg-strong, #000)',
      }}>
        {'> BROADCAST '}
        <BroadcastLiveTag />
      </div>

      <button
        onClick={() => (isBroadcasting ? pause() : broadcastPlay())}
        style={{
          fontFamily: MONO, fontSize: 11, lineHeight: '14px', letterSpacing: '0.04em',
          textTransform: 'uppercase', color: 'var(--vlg-strong, #000)',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          textAlign: 'left', width: 'fit-content',
        }}
      >
        {isBroadcasting ? '[ ❚❚ PAUSE ]' : '[ ▶ PLAY ]'}
      </button>

      <div style={{
        fontFamily: MONO, fontSize: 11, lineHeight: '14px',
        color: 'var(--vlg-fg-dim, #555)', fontVariantNumeric: 'tabular-nums',
      }}>
        {clock}
      </div>

      {/* The counter — ghost layer of fully-lit 8s under the live value */}
      {counter && <div style={{
        border: '1px solid var(--vlg-fg, #000)', width: 'fit-content', marginTop: 4,
        padding: '18px 20px 14px', textAlign: 'center', userSelect: 'none',
      }}>
        <div style={{ position: 'relative', fontFamily: DSEG7, fontSize: 44, lineHeight: 1 }}>
          <span aria-hidden style={{ color: 'var(--vlg-fg, #000)', opacity: 0.09 }}>{GHOST}</span>
          <span ref={valueRef} style={{
            position: 'absolute', left: 0, top: 0, color: 'var(--vlg-fg, #000)',
          }}>{IDLE}</span>
        </div>
        <div style={{
          fontFamily: DSEG14, fontSize: 22, lineHeight: 1, marginTop: 10,
          color: 'var(--vlg-fg, #000)',
        }}>
          MHz
        </div>
      </div>}
    </div>
  );
}
