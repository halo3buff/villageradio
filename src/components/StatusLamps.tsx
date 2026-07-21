'use client';

import { useRef, useEffect } from 'react';
import { useAudio } from '@/lib/audio-context';

/**
 * Mainframe front-panel lamps — a row of frequency-gated status LEDs driven by
 * the real broadcast spectrum (analyserFreq). Four amber band lamps (sub-bass
 * pulses slow, HI flickers nervously), a steady green CARRIER when tuned in,
 * and a red CLIP that only fires on genuinely hot peaks. Color is diagnostic,
 * never decorative. Lamps go dark when nothing is playing — they don't lie.
 */

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const AMBER = '#ffb000', GREEN = '#4a9e4a', RED = '#ff0000';

const BANDS = [
  { label: 'SUB', lo: 20,   hi: 60,    gain: 1.5 },
  { label: 'LOW', lo: 60,   hi: 250,   gain: 1.2 },
  { label: 'MID', lo: 250,  hi: 2000,  gain: 1.2 },
  { label: 'HI',  lo: 4000, hi: 12000, gain: 1.9 },
];

const LAMPS = [
  ...BANDS.map(b => ({ label: b.label, color: AMBER })),
  { label: 'CARRIER', color: GREEN },
  { label: 'CLIP', color: RED },
];

const OFF = 0.12; // a dark lamp is still faintly there, like unlit glass

export function StatusLamps() {
  const { isPlaying, mode, analyserFreq } = useAudio();

  const liveRef = useRef(false);
  useEffect(() => { liveRef.current = mode === 'broadcast' && isPlaying; }, [mode, isPlaying]);
  const freqRef = useRef<AnalyserNode | null>(null);
  useEffect(() => { freqRef.current = analyserFreq; }, [analyserFreq]);

  const lampRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const bufRef = useRef(new Uint8Array(1024));
  const clipRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const a = freqRef.current;
      const live = liveRef.current;
      const levels = [0, 0, 0, 0];
      let peak = 0;

      if (live && a) {
        if (bufRef.current.length !== a.frequencyBinCount) {
          bufRef.current = new Uint8Array(a.frequencyBinCount);
        }
        const buf = bufRef.current;
        a.getByteFrequencyData(buf);
        const hzPerBin = a.context.sampleRate / 2 / a.frequencyBinCount;
        for (let b = 0; b < BANDS.length; b++) {
          const { lo, hi, gain } = BANDS[b];
          const i0 = Math.max(1, Math.round(lo / hzPerBin));
          const i1 = Math.min(buf.length - 1, Math.round(hi / hzPerBin));
          let sum = 0;
          for (let i = i0; i <= i1; i++) sum += buf[i];
          levels[b] = Math.min(1, (sum / (i1 - i0 + 1) / 255) * gain);
        }
        for (let i = 0; i < buf.length; i++) if (buf[i] > peak) peak = buf[i];
      }

      // Clip holds then decays so a single hot transient stays visible.
      clipRef.current = peak >= 250 ? 1 : clipRef.current * 0.94;

      const set = (i: number, v: number) => {
        const el = lampRefs.current[i];
        if (el) el.style.opacity = (OFF + (1 - OFF) * v).toFixed(3);
      };
      for (let b = 0; b < BANDS.length; b++) set(b, levels[b]);
      set(BANDS.length, live ? 1 : 0);                 // CARRIER — steady, not audio-reactive
      set(BANDS.length + 1, clipRef.current > 0.05 ? clipRef.current : 0);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ display: 'flex', gap: 18, fontFamily: MONO }}>
      {LAMPS.map((l, i) => (
        <div key={l.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <span
            ref={el => { lampRefs.current[i] = el; }}
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: l.color, opacity: OFF, display: 'block',
            }}
          />
          <span style={{ fontSize: 8, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)', opacity: 0.5 }}>
            {l.label}
          </span>
        </div>
      ))}
    </div>
  );
}
