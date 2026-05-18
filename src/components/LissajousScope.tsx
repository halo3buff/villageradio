'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { broadcastPlaylist } from '@/lib/data/mixes';

const VR_FONT = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const SAMPLE_COUNT = 256;

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const COLS = 8, ROWS = 8;
  const cw = w / COLS;
  const ch = h / ROWS;
  const cx = w / 2;
  const cy = h / 2;

  // Major grid lines — very faint, like etched glass on a real scope
  ctx.strokeStyle = 'rgba(0, 200, 60, 0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= COLS; i++) {
    ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, h); ctx.stroke();
  }
  for (let j = 0; j <= ROWS; j++) {
    ctx.beginPath(); ctx.moveTo(0, j * ch); ctx.lineTo(w, j * ch); ctx.stroke();
  }

  // Center axes — slightly more visible than major lines
  ctx.strokeStyle = 'rgba(0, 200, 60, 0.12)';
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();

  // Minor tick marks (every 1/5 of a major division) on center axes only
  ctx.strokeStyle = 'rgba(0, 200, 60, 0.09)';
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
function getNowLabel(index: number, mode: string): string | null {
  if (mode !== 'broadcast') return null;
  const track = broadcastPlaylist[index];
  if (!track) return null;
  if (track.kind === 'inter') return 'TRANSMISSION BREAK';
  const mixNum = broadcastPlaylist.slice(0, index + 1).filter(t => t.kind === 'mix').length;
  const totalMixes = broadcastPlaylist.filter(t => t.kind === 'mix').length;
  return `BROADCAST ${String(mixNum).padStart(2, '0')} OF ${String(totalMixes).padStart(2, '0')}`;
}

export function LissajousScope() {
  const { isPlaying, mode, broadcastIndex, broadcastPlay, pause, analyserL, analyserR, analyserFreq, volume, setVolume } = useAudio();
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  const analyserFreqRef = useRef<AnalyserNode | null>(null);
  useEffect(() => { analyserLRef.current = analyserL; }, [analyserL]);
  useEffect(() => { analyserRRef.current = analyserR; }, [analyserR]);
  useEffect(() => { analyserFreqRef.current = analyserFreq; }, [analyserFreq]);

  const [peakFreq, setPeakFreq] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastFreqUpdateRef = useRef<number>(0);

  const [acqLines, setAcqLines] = useState<string[]>([]);
  const [showReadout, setShowReadout] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [acquiring, setAcquiring] = useState(false);

  const isBroadcasting = mode === 'broadcast' && isPlaying;

  // Acquisition sequence on mount
  useEffect(() => {
    const seq = ['ACQUIRING SIGNAL...', 'LOCK: CONFIRMED', 'PLOTTING...'];
    const timers: ReturnType<typeof setTimeout>[] = [];
    seq.forEach((line, i) => {
      timers.push(setTimeout(() => setAcqLines(prev => [...prev, line]), i * 300));
    });
    timers.push(setTimeout(() => setShowReadout(true), 950));
    return () => timers.forEach(clearTimeout);
  }, []);

  // Clear acquiring indicator once audio starts
  useEffect(() => {
    if (isPlaying) setAcquiring(false);
  }, [isPlaying]);

  // Responsive square canvas via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(() => {
      const size = Math.floor(container.clientWidth);
      if (size <= 0) return;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, size, size);
        drawGrid(ctx, size, size);
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Animation loop
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

    // Phosphor decay — slightly faster so old traces fade cleanly
    ctx.fillStyle = 'rgba(8, 8, 8, 0.35)';
    ctx.fillRect(0, 0, w, h);

    // Grid always present
    drawGrid(ctx, w, h);

    // Signal trace — no artificial glow, pure phosphor dot density
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 255, 80, 0.65)';

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
      // Noise floor — tiny static at center until audio starts
      for (let i = 0; i < 60; i++) {
        const l = (Math.random() - 0.5) * 0.03;
        const r = (Math.random() - 0.5) * 0.03;
        ctx.fillRect(w / 2 + l * w * 0.45, h / 2 - r * h * 0.45, 1, 1);
      }
    }

    // Peak frequency — throttled to ~3 Hz to keep the readout legible
    const aF = analyserFreqRef.current;
    const now = performance.now();
    if (aF && now - lastFreqUpdateRef.current > 300) {
      lastFreqUpdateRef.current = now;
      const bins = new Float32Array(aF.frequencyBinCount);
      aF.getFloatFrequencyData(bins);
      let peakBin = -1;
      let peakDb = -Infinity;
      // Skip the DC bin (0) — the loudest "frequency" otherwise is always 0 Hz
      for (let i = 1; i < bins.length; i++) {
        if (bins[i] > peakDb) {
          peakDb = bins[i];
          peakBin = i;
        }
      }
      // Treat very quiet signal as no signal so we don't display garbage when paused
      if (peakBin > 0 && peakDb > -80) {
        const binHz = aF.context.sampleRate / aF.fftSize;
        setPeakFreq(peakBin * binHz);
      } else {
        setPeakFreq(null);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  // Start animation after acquisition sequence
  useEffect(() => {
    const timer = setTimeout(() => {
      rafRef.current = requestAnimationFrame(animate);
    }, 900);
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

  const nowLabel = getNowLabel(broadcastIndex, mode);
  const statusLabel = isBroadcasting
    ? 'LIVE'
    : acquiring
    ? 'ACQUIRING'
    : 'STANDBY';

  const readoutRows: [string, string][] = [
    ['MODE', 'XY / LISSAJOUS'],
    ['INPUT', 'L+R STEREO'],
    ['SIGNAL', 'VILLAGE RADIO'],
    ['FREQ', peakFreq == null ? '—' : peakFreq >= 1000 ? `${(peakFreq / 1000).toFixed(2)} kHz` : `${Math.round(peakFreq)} Hz`],
    ['STATUS', statusLabel],
    ...(nowLabel ? [['NOW', nowLabel] as [string, string]] : []),
  ];

  return (
    <div style={{ fontFamily: VR_FONT, display: 'block', width: '100%' }}>
      {/* Panel label — outside bezel */}
      <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: 'rgba(0,200,60,0.5)', marginBottom: '6px' }}>
        VECTORSCOPE  CH1/CH2
      </div>

      {/* Scope bezel */}
      <div
        style={{
          border: '1px solid rgba(0,200,60,0.2)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,0,0,0.5), 0 0 30px rgba(0,180,60,0.05)',
          background: '#050505',
          position: 'relative',
        }}
      >
        {/* Square container — ResizeObserver target */}
        <div
          ref={containerRef}
          style={{ width: '100%', aspectRatio: '1 / 1', lineHeight: 0, position: 'relative' }}
        >
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
        </div>

        {/* CRT scan lines */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            background: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.10) 1px, rgba(0,0,0,0.10) 2px)',
            pointerEvents: 'none',
          }}
        />
        {/* Vignette */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.55) 100%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Technical readout */}
      <div style={{ padding: '6px 0', fontSize: '9px', letterSpacing: '0.15em', lineHeight: '1.5' }}>
        {acqLines.map((line, i) => (
          <div key={i} style={{ color: '#4a9e4a' }}>{line}</div>
        ))}
        {showReadout && (
          <div style={{ marginTop: acqLines.length ? '8px' : 0 }}>
            {readoutRows.map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: '12px' }}>
                <span style={{ color: '#6b5f3a', minWidth: '68px' }}>{label}</span>
                <span style={{
                  color: label === 'STATUS' && statusLabel === 'LIVE' ? '#4a9e4a' : '#e8e4d9',
                }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Broadcast button + volume control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={handleButton}
          onMouseEnter={() => setBtnHover(true)}
          onMouseLeave={() => setBtnHover(false)}
          style={{
            fontFamily: 'inherit',
            fontSize: '9px',
            letterSpacing: '0.15em',
            color: isBroadcasting || btnHover ? '#e8e4d9' : 'rgba(232,228,217,0.45)',
            background: 'none',
            border: `1px solid ${isBroadcasting ? 'rgba(0,255,80,0.25)' : btnHover ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)'}`,
            boxShadow: isBroadcasting ? '0 0 8px rgba(0,255,80,0.2)' : 'none',
            padding: '4px 12px',
            cursor: 'pointer',
            transition: 'color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          {isBroadcasting
            ? '[ TRANSMITTING ]'
            : acquiring && !isPlaying
            ? '[ ACQUIRING... ]'
            : '[ BROADCAST ]'}
        </button>

        {/* Volume control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', letterSpacing: '0.15em' }}>
          <span style={{ color: '#6b5f3a' }}>LEVEL</span>
          <button
            onClick={() => setVolume(Math.max(0, volume - 0.1))}
            style={{
              fontFamily: 'inherit', fontSize: '9px', letterSpacing: '0.1em',
              color: 'rgba(232,228,217,0.55)', background: 'none', border: 'none',
              padding: '0 4px', cursor: 'pointer', lineHeight: 1,
            }}
          >–</button>
          <span style={{ color: '#e8e4d9', minWidth: '10px', textAlign: 'center' }}>
            {Math.round(volume * 10)}
          </span>
          <button
            onClick={() => setVolume(Math.min(1, volume + 0.1))}
            style={{
              fontFamily: 'inherit', fontSize: '9px', letterSpacing: '0.1em',
              color: 'rgba(232,228,217,0.55)', background: 'none', border: 'none',
              padding: '0 4px', cursor: 'pointer', lineHeight: 1,
            }}
          >+</button>
        </div>
      </div>
    </div>
  );
}
