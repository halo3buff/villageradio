'use client';

import { useCallback, useEffect, useRef } from 'react';

const VR_FONT = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const AMBER = '#d4aa50';
const AMBER_DIM = 'rgba(200, 185, 120, 0.6)';
const AMBER_CAPTION = 'rgba(200, 185, 120, 0.35)';
const BG = '#050505';
const BORDER = '1px solid #1a1a1a';

function powerToColor(v: number): [number, number, number] {
  if (v < 25)  return [4, 4, 18];
  if (v < 60)  return [8, 16, 90];
  if (v < 100) return [15, 70, 160];
  if (v < 140) return [20, 160, 190];
  if (v < 175) return [160, 210, 50];
  if (v < 210) return [230, 170, 15];
  return [255, 245, 200];
}

function drawSpectrumFrame(canvas: HTMLCanvasElement, data: Uint8Array): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0) return;
  const w = canvas.width;
  const h = canvas.height;
  const bc = data.length;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  ctx.lineWidth = 1;
  for (const db of [-40, -60, -80, -100, -120]) {
    const y = h - ((db + 120) / 80) * h;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  const thY = h - ((-60 + 120) / 80) * h;
  ctx.strokeStyle = 'rgba(200,50,50,0.4)';
  ctx.beginPath(); ctx.moveTo(0, thY); ctx.lineTo(w, thY); ctx.stroke();

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

  ctx.beginPath();
  for (let i = 0; i < bc; i++) {
    const x = (i / bc) * w;
    const y = h - (((-120 + (data[i] / 255) * 80) + 120) / 80) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = AMBER_DIM;
  ctx.font = `9px ${VR_FONT}`;
  ctx.textAlign = 'right';
  for (const db of [-40, -60, -80, -100, -120]) {
    const y = h - ((db + 120) / 80) * h;
    ctx.fillText(`${db}`, w - 4, y - 3);
  }
}

function updateWaterfallBuffer(
  buf: Uint8ClampedArray, w: number, h: number, data: Uint8Array, bc: number,
): void {
  const rowBytes = w * 4;
  buf.copyWithin(rowBytes, 0, (h - 1) * rowBytes);
  for (let x = 0; x < w; x++) {
    const binIdx = Math.min(Math.floor((x / w) * bc), bc - 1);
    const [r, g, b] = powerToColor(data[binIdx]);
    const off = x * 4;
    buf[off] = r; buf[off + 1] = g; buf[off + 2] = b; buf[off + 3] = 255;
  }
}

function formatHz(hz: number): string {
  if (hz < 1000) return `${Math.round(hz)}`;
  const k = hz / 1000;
  return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
}

interface Props {
  analyser: AnalyserNode | null;
  active: boolean;
}

export function RecordingSpectrum({ analyser, active }: Props) {
  const specCanvasRef = useRef<HTMLCanvasElement>(null);
  const wfCanvasRef = useRef<HTMLCanvasElement>(null);
  const specContainerRef = useRef<HTMLDivElement>(null);
  const wfContainerRef = useRef<HTMLDivElement>(null);

  const wfBufRef = useRef<Uint8ClampedArray | null>(null);
  const wfWRef = useRef(0);
  const wfHRef = useRef(0);
  const rafRef = useRef(0);
  const frameRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const activeRef = useRef(false);

  useEffect(() => { analyserRef.current = analyser; }, [analyser]);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const spec = specCanvasRef.current;
      const specC = specContainerRef.current;
      if (spec && specC) {
        const r = specC.getBoundingClientRect();
        spec.width = Math.floor(r.width);
        spec.height = Math.floor(r.height);
      }
      const wf = wfCanvasRef.current;
      const wfC = wfContainerRef.current;
      if (wf && wfC) {
        const r = wfC.getBoundingClientRect();
        const w = Math.floor(r.width), h = Math.floor(r.height);
        wf.width = w; wf.height = h;
        wfWRef.current = w; wfHRef.current = h;
        const buf = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < buf.length; i += 4) { buf[i] = 4; buf[i + 1] = 4; buf[i + 2] = 18; buf[i + 3] = 255; }
        wfBufRef.current = buf;
      }
    });
    if (specContainerRef.current) ro.observe(specContainerRef.current);
    if (wfContainerRef.current) ro.observe(wfContainerRef.current);
    return () => ro.disconnect();
  }, []);

  const animate = useCallback(() => {
    const n = frameRef.current++;
    const a = analyserRef.current;
    const isActive = activeRef.current;
    const bc = a ? a.frequencyBinCount : 256;
    const freqData = new Uint8Array(bc);
    if (a && isActive) {
      a.getByteFrequencyData(freqData);
    } else {
      // Idle noise floor — same look as /listen when nothing is playing
      for (let i = 0; i < bc; i++) freqData[i] = Math.floor(Math.random() * 18 + 4);
    }

    const spec = specCanvasRef.current;
    if (spec && spec.width > 0) drawSpectrumFrame(spec, freqData);

    if (n % 3 === 0) {
      const wf = wfCanvasRef.current;
      const buf = wfBufRef.current;
      const ww = wfWRef.current, wh = wfHRef.current;
      if (wf && buf && ww > 0 && wh > 0) {
        const ctx = wf.getContext('2d');
        if (ctx) {
          updateWaterfallBuffer(buf, ww, wh, freqData, bc);
          const imgData = ctx.createImageData(ww, wh);
          imgData.data.set(buf);
          ctx.putImageData(imgData, 0, 0);
          ctx.strokeStyle = 'rgba(200,50,50,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const ty = Math.floor(wh * 0.72);
          ctx.moveTo(0, ty); ctx.lineTo(ww, ty); ctx.stroke();
        }
      }
    }

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  const nyquist = analyser ? analyser.context.sampleRate / 2 : 24000;
  const labels: string[] = [];
  const SEGMENTS = 6;
  for (let i = 0; i <= SEGMENTS; i++) labels.push(formatHz((i / SEGMENTS) * nyquist));

  return (
    <div
      style={{
        fontFamily: VR_FONT,
        background: '#0a0a0a',
        color: '#e8e4d9',
        display: 'flex',
        flexDirection: 'column',
        border: BORDER,
        overflow: 'hidden',
        minWidth: 0,
        height: '100%',
      }}
    >
      <div ref={specContainerRef} style={{ flex: '35 35 0', borderBottom: BORDER, overflow: 'hidden' }}>
        <canvas ref={specCanvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>

      <div ref={wfContainerRef} style={{ flex: '65 65 0', overflow: 'hidden' }}>
        <canvas ref={wfCanvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>

      <div style={{ flex: '0 0 auto', borderTop: BORDER, padding: '4px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
          {labels.map((l, i) => (
            <span key={i} style={{ fontSize: 9, color: AMBER_DIM, letterSpacing: '0.1em' }}>{l}</span>
          ))}
        </div>
        <div style={{ fontSize: 8, color: AMBER_CAPTION, letterSpacing: '0.08em', paddingLeft: 4, marginTop: 2 }}>
          MIC: Audio Spectrum (Power vs Freq, Hz)
        </div>
      </div>
    </div>
  );
}
