'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useAudio } from '@/lib/audio-context';
import { formatDuration } from '@/lib/content/broadcast';
import type { Mix } from '@/lib/types';

const VR_FONT = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const GREEN = '#4a9e4a';
const GREEN_DIM = 'rgba(74, 158, 74, 0.5)';
const GREEN_FAINT = 'rgba(74, 158, 74, 0.2)';
const GREEN_CURSOR = 'rgba(74, 158, 74, 0.6)';
const OFF_WHITE = '#e8e4d9';
const OFF_WHITE_DIM = 'rgba(232, 228, 217, 0.35)';
const OFF_WHITE_HOVER = 'rgba(200, 196, 187, 0.7)';
const AMBER = '#d4aa50';
const AMBER_DIM = 'rgba(200, 185, 120, 0.6)';
const BG = '#050505';
const BORDER = '1px solid #1a1a1a';

const FREQ_MIN = 2665;
const FREQ_MAX = 2695;

const PARAM_LINES = [
  'SDR:', 'rx_freq=88.500 MHz', 'sample_rate=2.048 MHz', 'rx_gain=28.0 dB (AGC)',
  '', 'Spectrum:', 'SPAN=2.048 MHz', 'RBW=4 kHz', 'VBW=10 kHz',
  '', 'Waterfall:', 'period=100ms', 'line_off=0 us', 'Refresh=50 ms', 'squelch=-60 dBm',
];

const FREQ_LABELS = ['2665', '2670', '2675', '2680', '2685', '2690', '2695'];

const SEP = '─'.repeat(18);

type FilterMode = 'ALL' | 'BROADCAST' | 'TRANSMISSION';

function powerToColor(v: number): [number, number, number] {
  if (v < 25)  return [4, 4, 18];
  if (v < 60)  return [8, 16, 90];
  if (v < 100) return [15, 70, 160];
  if (v < 140) return [20, 160, 190];
  if (v < 175) return [160, 210, 50];
  if (v < 210) return [230, 170, 15];
  return [255, 245, 200];
}

function parseDurSec(dur: string): number {
  const parts = dur.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function drawSpectrumFrame(
  canvas: HTMLCanvasElement,
  data: Uint8Array,
  peakHold: Float32Array | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0) return;
  const w = canvas.width;
  const h = canvas.height;
  const bc = data.length;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // dBm grid lines
  ctx.lineWidth = 1;
  for (const db of [-40, -60, -80, -100, -120]) {
    const y = h - ((db + 120) / 80) * h;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Threshold at -60 dBm
  const thY = h - ((-60 + 120) / 80) * h;
  ctx.strokeStyle = 'rgba(200,50,50,0.4)';
  ctx.beginPath(); ctx.moveTo(0, thY); ctx.lineTo(w, thY); ctx.stroke();

  // Filled shape
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < bc; i++) {
    const x = (i / bc) * w;
    const y = h - (((-120 + (data[i] / 255) * 80) + 120) / 80) * h;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(180, 130, 30, 0.12)';
  ctx.fill();

  // Main spectrum line
  ctx.beginPath();
  for (let i = 0; i < bc; i++) {
    const x = (i / bc) * w;
    const y = h - (((-120 + (data[i] / 255) * 80) + 120) / 80) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Peak hold line
  if (peakHold) {
    ctx.beginPath();
    for (let i = 0; i < bc; i++) {
      const x = (i / bc) * w;
      const y = h - (((-120 + (peakHold[i] / 255) * 80) + 120) / 80) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(200, 160, 40, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // dBm labels
  ctx.fillStyle = AMBER_DIM;
  ctx.font = `9px ${VR_FONT}`;
  ctx.textAlign = 'right';
  for (const db of [-40, -60, -80, -100, -120]) {
    const y = h - ((db + 120) / 80) * h;
    ctx.fillText(`${db}`, w - 4, y - 3);
  }
}

function updateWaterfallBuffer(
  buf: Uint8ClampedArray, w: number, h: number,
  data: Uint8Array, bc: number,
  noiseProfile: Float32Array | null,
): void {
  const rowBytes = w * 4;
  buf.copyWithin(rowBytes, 0, (h - 1) * rowBytes);
  for (let x = 0; x < w; x++) {
    const binIdx = Math.min(Math.floor((x / w) * bc), bc - 1);
    const profileVal = noiseProfile ? noiseProfile[binIdx % noiseProfile.length] : 15;
    const noise = profileVal + (Math.random() * 4);
    const v = Math.max(data[binIdx], noise);
    const [r, g, b] = powerToColor(v);
    const off = x * 4;
    buf[off] = r; buf[off + 1] = g; buf[off + 2] = b; buf[off + 3] = 255;
  }
}

function drawColorScale(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0) return;
  const w = canvas.width;
  const h = canvas.height;
  const barW = Math.max(1, w - 22);

  for (let y = 0; y < h; y++) {
    const v = Math.floor(255 - (y / h) * 255);
    const [r, g, b] = powerToColor(v);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, barW, 1);
  }

  ctx.fillStyle = AMBER_DIM;
  ctx.font = `8px ${VR_FONT}`;
  ctx.textAlign = 'left';
  ['-20', '-40', '-60', '-80', '-100', '-120'].forEach((label, i, arr) => {
    const y = Math.round((i / (arr.length - 1)) * (h - 4)) + 4;
    ctx.fillText(label, barW + 2, y);
  });
}

export function SDRWaterfall() {
  const { playlist, currentTrack, isPlaying, mode, play, pause, analyserFreq } = useAudio();
  const analyserFreqRef = useRef<AnalyserNode | null>(null);
  useEffect(() => { analyserFreqRef.current = analyserFreq; }, [analyserFreq]);

  const specCanvasRef = useRef<HTMLCanvasElement>(null);
  const wfCanvasRef = useRef<HTMLCanvasElement>(null);
  const scaleCanvasRef = useRef<HTMLCanvasElement>(null);
  const specContainerRef = useRef<HTMLDivElement>(null);
  const wfContainerRef = useRef<HTMLDivElement>(null);
  const scaleContainerRef = useRef<HTMLDivElement>(null);

  const wfBufRef = useRef<Uint8ClampedArray | null>(null);
  const wfWRef = useRef(0);
  const wfHRef = useRef(0);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);

  // New: noise floor profile (initialized once)
  const noiseProfileRef = useRef<Float32Array | null>(null);
  // New: peak hold buffer
  const peakHoldRef = useRef<Float32Array | null>(null);
  // New: timestamp labels drawn on waterfall canvas
  const tsLabelsRef = useRef<{ y: number; text: string }[]>([]);
  const tsLastAddedRef = useRef<number>(0);
  const tsStartRef = useRef<number>(Date.now());

  const [visibleLines, setVisibleLines] = useState(0);
  const [statusLive, setStatusLive] = useState(false);
  const [selectedMix, setSelectedMix] = useState<Mix>(
    playlist.find(t => t.kind === 'mix') ?? playlist[0]
  );
  const [power, setPower] = useState<string | null>(null);
  const [iqMax, setIqMax] = useState<string | null>(null);
  const [durations, setDurations] = useState<Record<string, string>>({});
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const [cursorPct, setCursorPct] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterMode>('ALL');

  const isIndividualPlaying = isPlaying && mode === 'individual';
  const nowDisplay = isIndividualPlaying && currentTrack ? currentTrack.title : '—';
  const cursorFreq = cursorPct !== null
    ? (FREQ_MIN + cursorPct * (FREQ_MAX - FREQ_MIN)).toFixed(1)
    : null;

  // Deduplicated list for display — broadcast sequence reuses some interludes
  const uniqueTracks = playlist.filter(
    (t, i, arr) => arr.findIndex(u => u.src === t.src) === i
  );

  // Archive stats (computed from loaded durations)
  let archiveTotalSec = 0;
  for (const t of uniqueTracks) {
    const dur = durations[t.id];
    if (dur) archiveTotalSec += parseDurSec(dur);
  }
  const archiveHrs = Math.floor(archiveTotalSec / 3600);
  const archiveMin = Math.floor((archiveTotalSec % 3600) / 60);

  // Filtered track list
  const filteredTracks = uniqueTracks.filter(t => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'BROADCAST') return t.kind === 'mix';
    return t.kind === 'inter';
  });

  // Init noise floor profile once
  useEffect(() => {
    const profile = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) profile[i] = 10 + Math.random() * 8;
    noiseProfileRef.current = profile;
  }, []);

  // Boot sequence + timestamp init
  useEffect(() => {
    tsStartRef.current = Date.now();
    tsLastAddedRef.current = Date.now();
    tsLabelsRef.current = [{ y: 0, text: 'T+00:00' }];

    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      setVisibleLines(idx);
      if (idx >= PARAM_LINES.length) clearInterval(interval);
    }, 80);
    const statusTimer = setTimeout(() => setStatusLive(true), 2200);
    return () => { clearInterval(interval); clearTimeout(statusTimer); };
  }, []);

  // Preload track durations
  useEffect(() => {
    playlist.forEach((track) => {
      const probe = new Audio();
      probe.crossOrigin = 'anonymous';
      probe.preload = 'metadata';
      probe.src = track.src;
      probe.addEventListener('loadedmetadata', () => {
        setDurations(prev => ({ ...prev, [track.id]: formatDuration(probe.duration) }));
      }, { once: true });
    });
  }, [playlist]);

  // Power / IQ MAX readout
  useEffect(() => {
    const interval = setInterval(() => {
      const analyser = analyserFreqRef.current;
      if (!analyser) { setPower(null); setIqMax(null); return; }
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      let sum = 0, peak = 0;
      for (const v of data) { sum += v * v; if (v > peak) peak = v; }
      const rms = Math.sqrt(sum / data.length);
      setPower((-80 + (rms / 128) * 60).toFixed(1));
      setIqMax((-120 + (peak / 255) * 100).toFixed(1));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Canvas sizing via ResizeObserver
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const sizeCanvas = (canvas: HTMLCanvasElement | null, container: HTMLDivElement | null) => {
        if (!canvas || !container) return;
        const r = container.getBoundingClientRect();
        canvas.width = Math.floor(r.width);
        canvas.height = Math.floor(r.height);
      };
      sizeCanvas(specCanvasRef.current, specContainerRef.current);
      const wf = wfCanvasRef.current;
      const wfC = wfContainerRef.current;
      if (wf && wfC) {
        const r = wfC.getBoundingClientRect();
        const w = Math.floor(r.width), h = Math.floor(r.height);
        wf.width = w; wf.height = h;
        wfWRef.current = w; wfHRef.current = h;
        const buf = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < buf.length; i += 4) { buf[i] = 4; buf[i+1] = 4; buf[i+2] = 18; buf[i+3] = 255; }
        wfBufRef.current = buf;
      }
      const scale = scaleCanvasRef.current;
      const scaleC = scaleContainerRef.current;
      if (scale && scaleC) {
        const r = scaleC.getBoundingClientRect();
        scale.width = Math.floor(r.width);
        scale.height = Math.floor(r.height);
        drawColorScale(scale);
      }
    });
    [specContainerRef, wfContainerRef, scaleContainerRef].forEach(r => {
      if (r.current) ro.observe(r.current);
    });
    return () => ro.disconnect();
  }, []);

  // Animation loop
  const animate = useCallback(() => {
    const n = frameRef.current++;
    const analyser = analyserFreqRef.current;
    const bc = analyser ? analyser.frequencyBinCount : 256;
    const freqData = new Uint8Array(bc);

    if (analyser && isIndividualPlaying) {
      analyser.getByteFrequencyData(freqData);
    } else {
      // Noise floor when standby
      const profile = noiseProfileRef.current;
      for (let i = 0; i < bc; i++) {
        const base = profile ? profile[i % profile.length] : 15;
        freqData[i] = Math.floor(base + Math.random() * 4);
      }
    }

    // Update peak hold
    if (!peakHoldRef.current || peakHoldRef.current.length !== bc) {
      peakHoldRef.current = new Float32Array(bc);
    }
    const ph = peakHoldRef.current;
    for (let i = 0; i < bc; i++) {
      if (freqData[i] > ph[i]) ph[i] = freqData[i];
      else ph[i] *= 0.998;
    }

    const spec = specCanvasRef.current;
    if (spec && spec.width > 0) drawSpectrumFrame(spec, freqData, ph);

    if (n % 3 === 0) {
      const wf = wfCanvasRef.current;
      const buf = wfBufRef.current;
      const ww = wfWRef.current, wh = wfHRef.current;
      if (wf && buf && ww > 0 && wh > 0) {
        const ctx = wf.getContext('2d');
        if (ctx) {
          updateWaterfallBuffer(buf, ww, wh, freqData, bc, noiseProfileRef.current);
          const imgData = ctx.createImageData(ww, wh);
          imgData.data.set(buf);
          ctx.putImageData(imgData, 0, 0);

          // Squelch threshold line
          const ty = Math.floor(wh * 0.72);
          ctx.strokeStyle = 'rgba(200,50,50,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(ww, ty); ctx.stroke();

          // Squelch label (static, above line)
          ctx.fillStyle = 'rgba(200,50,50,0.7)';
          ctx.font = `8px ${VR_FONT}`;
          ctx.textAlign = 'left';
          ctx.fillText('SQ  -60dBm', 4, ty - 3);

          // Timestamp labels: scroll down, prune, add new, draw
          for (const lbl of tsLabelsRef.current) lbl.y += 1;
          tsLabelsRef.current = tsLabelsRef.current.filter(lbl => lbl.y < wh);
          const now = Date.now();
          if (now - tsLastAddedRef.current >= 30000) {
            tsLastAddedRef.current = now;
            const elapsed = Math.round((now - tsStartRef.current) / 1000);
            const mm = Math.floor(elapsed / 60);
            const ss = elapsed % 60;
            const prefix = isIndividualPlaying ? 'T-' : 'T+';
            const text = `${prefix}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
            tsLabelsRef.current.unshift({ y: 0, text });
          }
          ctx.fillStyle = 'rgba(74,158,74,0.45)';
          ctx.font = `8px ${VR_FONT}`;
          ctx.textAlign = 'left';
          for (const lbl of tsLabelsRef.current) {
            ctx.fillText(lbl.text, 4, lbl.y + 8);
          }
        }
      }
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [isIndividualPlaying]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  const handleCursorMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCursorPct((e.clientX - rect.left) / rect.width);
  }, []);

  const handleCursorLeave = useCallback(() => setCursorPct(null), []);

  const handleTrackSelect = (mix: Mix) => {
    setSelectedMix(mix);
    play(mix);
  };

  const handleToggle = () => {
    if (isIndividualPlaying) pause();
    else play(selectedMix);
  };

  return (
    <div
      style={{
        fontFamily: VR_FONT,
        background: '#0a0a0a',
        color: OFF_WHITE,
        display: 'flex',
        height: 'calc(100vh - 180px)',
        minHeight: '400px',
        maxHeight: '640px',
        border: BORDER,
        overflow: 'hidden',
      }}
    >
      {/* ─── Left panel ─── */}
      <div style={{
        width: '200px', flexShrink: 0, borderRight: BORDER,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', fontSize: '9px', lineHeight: '1.6', padding: '10px', gap: '8px',
      }}>

        {/* Archive stats header (always visible, above boot sequence) */}
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ color: GREEN_CURSOR }}>ARCHIVE</div>
          <div style={{ color: GREEN_FAINT }}>{SEP}</div>
          <div style={{ color: GREEN_CURSOR }}>
            {archiveTotalSec > 0
              ? `${archiveHrs} HRS ${archiveMin} MIN`
              : '— HRS — MIN'}
          </div>
          <div style={{ color: GREEN_CURSOR }}>
            {uniqueTracks.length} TRANSMISSIONS
          </div>
          <div style={{ color: GREEN_FAINT }}>{SEP}</div>
        </div>

        {/* SDR parameters boot sequence */}
        <div style={{ flex: '0 0 auto' }}>
          {PARAM_LINES.slice(0, visibleLines).map((line, i) => (
            <div key={i} style={{ color: GREEN_DIM, minHeight: '1.6em' }}>{line}</div>
          ))}
        </div>

        {/* Live data */}
        {statusLive && (
          <div style={{ flex: '0 0 auto', borderTop: '1px solid rgba(74,158,74,0.2)', paddingTop: '6px' }}>
            <div style={{ color: GREEN_DIM }}>POWER=<span style={{ color: GREEN }}>{power !== null ? `${power} dBm` : '—'}</span></div>
            <div style={{ color: GREEN_DIM }}>IQ MAX=<span style={{ color: GREEN }}>{iqMax !== null ? `${iqMax} dBFS` : '—'}</span></div>
            <div style={{ color: GREEN_DIM }}>SIGNAL=<span style={{ color: GREEN }}>VILLAGE RADIO</span></div>
            <div style={{ color: GREEN_DIM }}>STATUS=<span style={{ color: isIndividualPlaying ? GREEN : GREEN_DIM }}>{isIndividualPlaying ? 'LIVE' : 'STANDBY'}</span></div>
            <div style={{ color: GREEN_DIM }}>NOW=<span style={{ color: GREEN }}>{nowDisplay}</span></div>
            {cursorFreq && (
              <div style={{ color: GREEN_DIM }}>CURSOR=<span style={{ color: GREEN_CURSOR }}>{cursorFreq} MHz</span></div>
            )}
          </div>
        )}

        {/* Archive section: filter tabs + scrollable track list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {/* Section header + filters */}
          <div style={{ flex: '0 0 auto', borderTop: '1px solid rgba(74,158,74,0.2)', paddingTop: '6px', marginBottom: '4px' }}>
            <div style={{ color: GREEN_CURSOR, marginBottom: '2px' }}>ARCHIVE</div>
            <div style={{ color: GREEN_FAINT, marginBottom: '4px' }}>{SEP}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['ALL', 'BROADCAST', 'TRANSMISSION'] as FilterMode[]).map(f => (
                <span
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  style={{
                    color: activeFilter === f ? OFF_WHITE : 'rgba(232,228,217,0.3)',
                    cursor: activeFilter === f ? 'default' : 'pointer',
                    letterSpacing: '0.05em',
                    fontSize: '8px',
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Scrollable track list */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(74,158,74,0.3) transparent',
          } as React.CSSProperties}>
            {filteredTracks.map((mix, idx) => {
              const globalIdx = playlist.indexOf(mix);
              const vrId = `VR-${String(globalIdx + 1).padStart(3, '0')}`;
              const isActive = currentTrack?.id === mix.id && isIndividualPlaying;
              const isSelected = selectedMix.id === mix.id;
              const isHovered = hoveredTrack === mix.id;
              return (
                <div
                  key={mix.id}
                  onClick={() => handleTrackSelect(mix)}
                  onMouseEnter={() => setHoveredTrack(mix.id)}
                  onMouseLeave={() => setHoveredTrack(null)}
                  style={{
                    display: 'flex', gap: '5px', cursor: 'pointer', padding: '1px 0',
                    color: isActive || isSelected ? OFF_WHITE : isHovered ? OFF_WHITE_HOVER : OFF_WHITE_DIM,
                    transition: 'color 0.1s ease',
                  }}
                >
                  <span style={{
                    width: '8px', flexShrink: 0,
                    color: isActive ? GREEN : isSelected ? 'rgba(74,158,74,0.4)' : 'transparent',
                  }}>›</span>
                  <span style={{ width: '34px', flexShrink: 0, opacity: 0.45, fontSize: '8px' }}>{vrId}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '8px' }}>
                    {mix.title}
                  </span>
                  <span style={{ flexShrink: 0, opacity: 0.4, fontSize: '8px' }}>
                    {durations[mix.id] ?? '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Broadcast button */}
        <div style={{ flex: '0 0 auto' }}>
          <button
            onClick={handleToggle}
            style={{
              fontFamily: 'inherit', fontSize: '9px', letterSpacing: '0.12em',
              color: isIndividualPlaying ? OFF_WHITE_DIM : OFF_WHITE,
              background: 'none',
              border: `1px solid ${isIndividualPlaying ? 'rgba(232,228,217,0.15)' : 'rgba(232,228,217,0.25)'}`,
              padding: '3px 8px', cursor: 'pointer', transition: 'color 0.1s, border-color 0.1s',
            }}
          >
            {isIndividualPlaying ? '■ PAUSE' : '▶ BROADCAST'}
          </button>
        </div>
      </div>

      {/* ─── Center column ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Cursor interaction wrapper — spans spec + waterfall only */}
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}
          onMouseMove={handleCursorMove}
          onMouseLeave={handleCursorLeave}
        >
          {/* Spectrum */}
          <div ref={specContainerRef} style={{ flex: '35 35 0', borderBottom: BORDER, overflow: 'hidden' }}>
            <canvas ref={specCanvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>

          {/* Waterfall */}
          <div ref={wfContainerRef} style={{ flex: '65 65 0', overflow: 'hidden' }}>
            <canvas ref={wfCanvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>

          {/* Frequency cursor overlay */}
          {cursorPct !== null && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              pointerEvents: 'none',
            }}>
              {/* Hairline */}
              <div style={{
                position: 'absolute',
                left: `${cursorPct * 100}%`,
                top: 0, bottom: 0, width: '1px',
                background: 'rgba(255,255,255,0.25)',
              }} />
              {/* Frequency label */}
              <div style={{
                position: 'absolute',
                left: `${Math.max(2, Math.min(cursorPct * 100, 90))}%`,
                top: '3px',
                transform: 'translateX(-50%)',
                fontFamily: VR_FONT, fontSize: '9px',
                color: '#e8e4d9',
                background: 'rgba(0,0,0,0.7)',
                padding: '1px 4px',
                whiteSpace: 'nowrap',
                letterSpacing: '0.05em',
              }}>
                {cursorFreq} MHz
              </div>
            </div>
          )}
        </div>

        {/* Frequency axis */}
        <div style={{ flex: '0 0 auto', borderTop: BORDER, padding: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
            {FREQ_LABELS.map(l => (
              <span key={l} style={{ fontSize: '9px', color: AMBER_DIM, letterSpacing: '0.1em' }}>{l}</span>
            ))}
          </div>
          <div style={{ fontSize: '8px', color: 'rgba(200,185,120,0.35)', letterSpacing: '0.08em', paddingLeft: '4px', marginTop: '2px' }}>
            RX1: Mixed (Power vs Freq and Time(us))
          </div>
        </div>
      </div>

      {/* ─── Right color scale ─── */}
      <div ref={scaleContainerRef} style={{ width: '40px', flexShrink: 0, borderLeft: BORDER, overflow: 'hidden' }}>
        <canvas ref={scaleCanvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
