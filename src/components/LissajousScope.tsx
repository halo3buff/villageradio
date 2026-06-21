'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import type { Mix } from '@/lib/types';

const VR_FONT = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const SAMPLE_COUNT = 256;

// Grid + signal are drawn for a white page: faint black grid, black trace.
const GRID_LINE = 'rgba(0, 0, 0, 0.10)';
const GRID_AXIS = 'rgba(0, 0, 0, 0.22)';
const GRID_TICK = 'rgba(0, 0, 0, 0.16)';
const TRACE = 'rgba(0, 0, 0, 0.80)';
// Phosphor decay toward the white page background.
const DECAY = 'rgba(255, 255, 255, 0.30)';

// The extra instrument readout (MODE / INPUT / SIGNAL / FREQ / STATUS / NOW)
// and the acquisition sequence are kept here but hidden. Flip to bring them back.
const SHOW_READOUT = false;

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const COLS = 8, ROWS = 8;
  const cw = w / COLS;
  const ch = h / ROWS;
  const cx = w / 2;
  const cy = h / 2;

  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  for (let i = 0; i <= COLS; i++) {
    ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, h); ctx.stroke();
  }
  for (let j = 0; j <= ROWS; j++) {
    ctx.beginPath(); ctx.moveTo(0, j * ch); ctx.lineTo(w, j * ch); ctx.stroke();
  }

  ctx.strokeStyle = GRID_AXIS;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();

  ctx.strokeStyle = GRID_TICK;
  ctx.lineWidth = 1;
  const msx = cw / 5;
  const msy = ch / 5;
  const tk = 4;
  for (let i = 0; i * msx <= w + 0.5; i++) {
    if (i % 5 !== 0) {
      const x = i * msx;
      ctx.beginPath(); ctx.moveTo(x, cy - tk / 2); ctx.lineTo(x, cy + tk / 2); ctx.stroke();
    }
  }
  for (let i = 0; i * msy <= h + 0.5; i++) {
    if (i % 5 !== 0) {
      const y = i * msy;
      ctx.beginPath(); ctx.moveTo(cx - tk / 2, y); ctx.lineTo(cx + tk / 2, y); ctx.stroke();
    }
  }
}

// Derive "NOW" display string from broadcast state
function getNowLabel(index: number, mode: string, playlist: Mix[]): string | null {
  if (mode !== 'broadcast') return null;
  const track = playlist[index];
  if (!track) return null;
  if (track.kind === 'inter') return 'TRANSMISSION BREAK';
  const mixNum = playlist.slice(0, index + 1).filter(t => t.kind === 'mix').length;
  const totalMixes = playlist.filter(t => t.kind === 'mix').length;
  return `BROADCAST ${String(mixNum).padStart(2, '0')} OF ${String(totalMixes).padStart(2, '0')}`;
}

export function LissajousScope({ size = 430 }: { size?: number }) {
  const { playlist, isPlaying, mode, broadcastIndex, broadcastPlay, pause, analyserL, analyserR, analyserFreq, volume, setVolume } = useAudio();
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  const analyserFreqRef = useRef<AnalyserNode | null>(null);
  useEffect(() => { analyserLRef.current = analyserL; }, [analyserL]);
  useEffect(() => { analyserRRef.current = analyserR; }, [analyserR]);
  useEffect(() => { analyserFreqRef.current = analyserFreq; }, [analyserFreq]);

  const [peakFreq, setPeakFreq] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastFreqUpdateRef = useRef<number>(0);

  const [acqLines, setAcqLines] = useState<string[]>([]);
  const [showReadout, setShowReadout] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [acquiring, setAcquiring] = useState(false);

  const isBroadcasting = mode === 'broadcast' && isPlaying;

  // Acquisition sequence on mount (retained for the hidden readout)
  useEffect(() => {
    const seq = ['ACQUIRING SIGNAL...', 'LOCK: CONFIRMED', 'PLOTTING...'];
    const timers: ReturnType<typeof setTimeout>[] = [];
    seq.forEach((line, i) => {
      timers.push(setTimeout(() => setAcqLines(prev => [...prev, line]), i * 300));
    });
    timers.push(setTimeout(() => setShowReadout(true), 950));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (isPlaying) setAcquiring(false);
  }, [isPlaying]);

  // Initialise the fixed-size canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, size, size);
      drawGrid(ctx, size, size);
    }
  }, [size]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = DECAY;
    ctx.fillRect(0, 0, w, h);
    drawGrid(ctx, w, h);

    ctx.shadowBlur = 0;
    ctx.fillStyle = TRACE;

    const aL = analyserLRef.current;
    const aR = analyserRRef.current;

    if (aL && aR) {
      const bufL = new Float32Array(aL.fftSize);
      const bufR = new Float32Array(aR.fftSize);
      aL.getFloatTimeDomainData(bufL);
      aR.getFloatTimeDomainData(bufR);

      const stride = Math.floor(bufL.length / SAMPLE_COUNT);
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const idx = i * stride;
        const x = w / 2 + bufL[idx] * w * 0.45;
        const y = h / 2 - bufR[idx] * h * 0.45;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    } else {
      for (let i = 0; i < 60; i++) {
        const l = (Math.random() - 0.5) * 0.03;
        const r = (Math.random() - 0.5) * 0.03;
        ctx.fillRect(w / 2 + l * w * 0.45, h / 2 - r * h * 0.45, 1, 1);
      }
    }

    const aF = analyserFreqRef.current;
    const now = performance.now();
    if (aF && now - lastFreqUpdateRef.current > 300) {
      lastFreqUpdateRef.current = now;
      const bins = new Float32Array(aF.frequencyBinCount);
      aF.getFloatFrequencyData(bins);
      let peakBin = -1;
      let peakDb = -Infinity;
      for (let i = 1; i < bins.length; i++) {
        if (bins[i] > peakDb) {
          peakDb = bins[i];
          peakBin = i;
        }
      }
      if (peakBin > 0 && peakDb > -80) {
        const binHz = aF.context.sampleRate / aF.fftSize;
        setPeakFreq(peakBin * binHz);
      } else {
        setPeakFreq(null);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      rafRef.current = requestAnimationFrame(animate);
    }, 300);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [animate]);

  const handleButton = () => {
    if (isBroadcasting) {
      pause();
    } else {
      setAcquiring(true);
      broadcastPlay();
    }
  };

  const nowLabel = getNowLabel(broadcastIndex, mode, playlist);
  const statusLabel = isBroadcasting ? 'LIVE' : acquiring ? 'ACQUIRING' : 'STANDBY';

  const readoutRows: [string, string][] = [
    ['MODE', 'XY / LISSAJOUS'],
    ['INPUT', 'L+R STEREO'],
    ['SIGNAL', 'VILLAGE RADIO'],
    ['FREQ', peakFreq == null ? '—' : peakFreq >= 1000 ? `${(peakFreq / 1000).toFixed(2)} kHz` : `${Math.round(peakFreq)} Hz`],
    ['STATUS', statusLabel],
    ...(nowLabel ? [['NOW', nowLabel] as [string, string]] : []),
  ];

  return (
    <div style={{ fontFamily: VR_FONT }}>
      {/* Header bar: transmission button + level toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
        <button
          onClick={handleButton}
          onMouseEnter={() => setBtnHover(true)}
          onMouseLeave={() => setBtnHover(false)}
          style={{
            fontFamily: 'inherit',
            fontSize: '11px',
            letterSpacing: '0.15em',
            color: isBroadcasting ? '#ff0000' : btnHover ? '#000000' : 'rgba(0,0,0,0.55)',
            background: 'none',
            border: `1px solid ${isBroadcasting ? 'rgba(255,0,0,0.4)' : btnHover ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.18)'}`,
            padding: '5px 12px',
            cursor: 'pointer',
            transition: 'color 0.15s ease, border-color 0.15s ease',
          }}
        >
          {isBroadcasting
            ? '[ TRANSMITTING ]'
            : acquiring && !isPlaying
            ? '[ ACQUIRING... ]'
            : '[ BROADCAST ]'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', letterSpacing: '0.15em' }}>
          <span style={{ color: 'rgba(0,0,0,0.40)' }}>LEVEL</span>
          <button
            onClick={() => setVolume(Math.max(0, volume - 0.1))}
            style={{
              fontFamily: 'inherit', fontSize: '11px',
              color: 'rgba(0,0,0,0.55)', background: 'none', border: 'none',
              padding: '0 4px', cursor: 'pointer', lineHeight: 1,
            }}
          >–</button>
          <span style={{ color: '#000000', minWidth: '10px', textAlign: 'center' }}>
            {Math.round(volume * 10)}
          </span>
          <button
            onClick={() => setVolume(Math.min(1, volume + 0.1))}
            style={{
              fontFamily: 'inherit', fontSize: '11px',
              color: 'rgba(0,0,0,0.55)', background: 'none', border: 'none',
              padding: '0 4px', cursor: 'pointer', lineHeight: 1,
            }}
          >+</button>
        </div>
      </div>

      {/* Scope grid — transparent on white */}
      <div style={{ width: size, height: size, lineHeight: 0 }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: size, height: size }} />
      </div>

      {/* Hidden technical readout — re-enable via SHOW_READOUT */}
      {SHOW_READOUT && (
        <div style={{ padding: '6px 0', fontSize: '9px', letterSpacing: '0.15em', lineHeight: '1.5' }}>
          {acqLines.map((line, i) => (
            <div key={i} style={{ color: 'rgba(0,0,0,0.5)' }}>{line}</div>
          ))}
          {showReadout && (
            <div style={{ marginTop: acqLines.length ? '8px' : 0 }}>
              {readoutRows.map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ color: 'rgba(0,0,0,0.4)', minWidth: '68px' }}>{label}</span>
                  <span style={{ color: label === 'STATUS' && statusLabel === 'LIVE' ? '#ff0000' : '#000000' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
