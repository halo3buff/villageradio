'use client';

import Link from 'next/link';
import { stationClock } from '@/components/StationBar';
import { useAudio } from '@/lib/audio-context';
import { useEffect, useRef } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const PIXEL = "var(--font-vt323), 'Courier New', monospace";
const PROMPT_BAND = 72;   // the command prompt is fixed at bottom-left: the station sits above it
const DESKTOP = '#ffffff';

// the screen's own raster, and its colours, as measured off the reference photo
const W = 558, H = 383;
const BAR = '#78fce4', BAR_RULE = '#58d4bc', BAR_TEXT = '#3f9c74';
const TEXT = '#86d8b4', FRAME = '#a8e0c8', TRACE = '#d4f2e4', AXIS = 'rgba(134,216,180,0.13)';
const CELL = '#92f4d8', CELL_TEXT = '#2a7a5a';
// the bar, as a share of the screen: the play/pause button sits over it
const HIT = { left: 100 / W, top: 14 / H, width: 350 / W, height: 46 / H };

// The photographed tube: the raster bowed and tilted on the glass, softened as old video is, a
// tinted bloom round everything lit, a green haze where the trace is dense, the phosphor drifting
// between cyan and yellow-green, and warm, mottled, vignetted black behind it all.
const VERT = `attribute vec2 a; varying vec2 v;
void main() { v = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5); gl_Position = vec4(a, 0.0, 1.0); }`;
const FRAG = `precision highp float;
uniform sampler2D t; uniform float time; varying vec2 v;
const vec2 RES = vec2(${W}.0, ${H}.0);
const float ASPECT = ${W}.0 / ${H}.0;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 warp(vec2 uv) {
  vec2 p = (uv - 0.5) * 2.0 * vec2(ASPECT, 1.0);
  float c = cos(0.0205), s = sin(0.0205);
  p = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  p *= 1.0 + 0.047 * dot(p, p);
  return p / vec2(ASPECT, 1.0) * 0.5 + 0.5;
}
vec3 tap(vec2 uv) {
  vec2 e = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return texture2D(t, uv).rgb * e.x * e.y;
}
vec3 ring(vec2 uv, float r) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    c += tap(uv + vec2(cos(a), sin(a)) * r / RES);
  }
  return c / 12.0;
}
void main() {
  vec2 uv = warp(v);
  vec3 soft = tap(uv) * 0.5 + ring(uv, 0.75) * 0.5;
  vec3 glow = ring(uv, 1.8) * 0.5 + ring(uv, 3.0) * 0.5;
  vec3 wide = ring(uv, 6.0) * 0.5 + ring(uv, 10.0) * 0.5;
  float haze = dot(wide, vec3(0.3, 0.6, 0.1));
  vec3 col = soft * 0.82 + glow * vec3(0.12, 0.42, 0.26) + vec3(0.02, 0.26, 0.11) * haze;
  // the phosphor's colour wanders along the trace: cyan here, yellow-green there
  float m = 0.5 + 0.5 * sin(uv.x * 41.0 + uv.y * 23.0) * sin(uv.x * 13.0 - uv.y * 37.0);
  col *= mix(vec3(0.80, 1.0, 1.06), vec3(1.04, 1.0, 0.72), m);
  // the faintest raster, and a flicker
  col *= 0.965 + 0.035 * cos(uv.y * RES.y * 6.2832);
  col *= 0.985 + 0.015 * sin(time * 47.0);
  // warm black, mottled like the compressed photo, darker to the corners
  vec2 block = floor(v * RES / 4.0);
  vec3 black = vec3(0.034, 0.029, 0.024) + (hash(block) - 0.5) * vec3(0.012, 0.012, 0.008);
  col += black;
  col += (hash(v * RES + fract(time) * 91.0) - 0.5) * 0.018;
  vec2 q = v * 2.0 - 1.0;
  col *= 1.0 - 0.22 * pow(dot(q, q) * 0.5, 2.0);
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * The station as a page of an old sampling workstation, on its green tube: the call sign and a
 * command bar (the state in the bar; tapping it plays or pauses), the clock and channels at right,
 * a ruled row of readouts, and the stereo field as a Lissajous filling the screen. Off air it runs
 * a test signal, so the trace and the readouts never stop; everything is measured from whichever
 * samples are on screen. README and RADAR top-right; the prompt is global (see SiteFrame). The
 * StationBar stays off here.
 */
export function HomeDesktop() {
  const { analyserL, analyserR, isPlaying, mode, broadcastPlay, pause } = useAudio();
  const live = isPlaying && mode === 'broadcast';
  const state = useRef({ live, aL: analyserL, aR: analyserR });
  state.current = { live, aL: analyserL, aR: analyserR };
  const screen = useRef<HTMLCanvasElement>(null);

  // the body's min-h-screen is iOS's LARGE viewport, taller than what's visible with the URL bar
  // up: drop it while the station is up, so the page has nothing to scroll (as HomeTemp does)
  useEffect(() => {
    const body = document.body;
    const prev = [body.style.minHeight, body.style.background];
    body.style.minHeight = '0';
    body.style.background = DESKTOP;   // white under the prompt band too
    return () => { [body.style.minHeight, body.style.background] = prev; };
  }, []);

  useEffect(() => {
    const canvas = screen.current;
    if (!canvas) return;
    const page = document.createElement('canvas');
    page.width = W; page.height = H;
    const ctx = page.getContext('2d');
    if (!ctx) return;

    // the tube; without WebGL the page is simply shown flat
    const gl = canvas.getContext('webgl', { antialias: false });
    const flat = gl ? null : canvas.getContext('2d');
    let uTime: WebGLUniformLocation | null = null;
    if (gl) {
      const shader = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src); gl.compileShader(s);
        return s;
      };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog); gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      uTime = gl.getUniformLocation(prog, 'time');
    }

    let l = new Float32Array(2048), r = new Float32Array(2048);
    let readout = { lvl: '-', pk: '-', corr: '-', bal: '-' };
    let nextRead = 0, raf = 0;

    const text = (s: string, x: number, y: number, color = TEXT, align: CanvasTextAlign = 'left') => {
      ctx.fillStyle = color; ctx.textAlign = align;
      ctx.fillText(s, x, y);
    };
    // an inverted cell, as the reference picks out its selected values
    const cell = (s: string, x: number, y: number) => {
      const w = ctx.measureText(s).width;
      ctx.fillStyle = CELL; ctx.fillRect(x - 1, y - 11, w + 2, 14);
      text(s, x, y, CELL_TEXT);
      return x + w;
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const { live, aL, aR } = state.current;

      // the samples on screen: the broadcast, or the test signal whenever nothing's flowing
      let energy = 0;
      if (aL && aR) {
        if (l.length !== aL.fftSize) { l = new Float32Array(aL.fftSize); r = new Float32Array(aL.fftSize); }
        aL.getFloatTimeDomainData(l); aR.getFloatTimeDomainData(r);
        for (let i = 0; i < l.length; i++) energy += l[i] * l[i] + r[i] * r[i];
      }
      if (energy < 1e-9) {
        const t = now / 1000, amp = 0.58 + 0.04 * Math.sin(t * 0.7), w = (Math.PI * 2) / l.length;
        for (let i = 0; i < l.length; i++) {
          l[i] = amp * Math.sin(3 * w * i) + (Math.random() - 0.5) * 0.006;
          r[i] = amp * Math.sin(2 * w * i + t * 0.25) + (Math.random() - 0.5) * 0.006;
        }
      }
      if (now >= nextRead) {
        nextRead = now + 150;
        let ll = 0, rr = 0, lr = 0, pk = 0;
        for (let i = 0; i < l.length; i++) {
          ll += l[i] * l[i]; rr += r[i] * r[i]; lr += l[i] * r[i];
          pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i]));
        }
        const sign = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);
        const sl = Math.sqrt(ll), sr = Math.sqrt(rr);
        readout = {
          lvl: (10 * Math.log10((ll + rr) / (2 * l.length) || 1e-12)).toFixed(1),
          pk: (20 * Math.log10(pk || 1e-6)).toFixed(1),
          corr: sign(sl && sr ? lr / (sl * sr) : 0),
          bal: sign(sl + sr ? (sr - sl) / (sr + sl) : 0),
        };
      }

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.font = `19px ${getComputedStyle(canvas).fontFamily}`;
      ctx.textBaseline = 'alphabetic';

      // the call sign and the command bar
      text('VGF-8194', 104, 35, TEXT, 'right');
      text('COMMAND:', 104, 50, TEXT, 'right');
      ctx.fillStyle = BAR; ctx.fillRect(107, 23, 335, 30);
      ctx.fillStyle = BAR_RULE; ctx.fillRect(107, 37, 335, 1);
      const stars = !live || now % 1000 < 600 ? '***' : '   ';
      text(`${stars}  ${live ? 'ON AIR' : 'TEST'}  ${stars}`, 278, 35, BAR_TEXT, 'center');
      // the cursor, holding the play/pause, and the command it would run
      ctx.fillStyle = BAR_TEXT; ctx.fillRect(110, 40, 10, 12);
      ctx.fillStyle = BAR;
      if (live) { ctx.fillRect(112, 42, 2, 8); ctx.fillRect(116, 42, 2, 8); }
      else { ctx.beginPath(); ctx.moveTo(112, 42); ctx.lineTo(118, 46); ctx.lineTo(112, 50); ctx.fill(); }
      text(live ? 'PAUSE' : 'PLAY', 125, 50, BAR_TEXT);

      // the clock and the state, right of the bar
      text(stationClock(), 456, 37);
      text(live ? 'LIVE' : 'TEST', 456, 50);
      text('CHAN: 2', 456, 63);

      text('LISSAJOUS DISPLAY', 278, 64, TEXT, 'center');

      // the ruled row of readouts
      ctx.strokeStyle = FRAME; ctx.lineWidth = 2;
      ctx.strokeRect(45, 73, 475, 22);
      text('STEREO', 54, 89);
      let x = 134;
      text('LEVEL:', x, 89); x = cell(readout.lvl.padStart(5), x + ctx.measureText('LEVEL:').width + 2, 89) + 16;
      text(`PEAK:${readout.pk.padStart(5)}`, x, 89); x += ctx.measureText('PEAK:-00.0').width + 16;
      text(`CORR:${readout.corr}`, x, 89); x += ctx.measureText('CORR:+0.00').width + 16;
      text('BAL:', x, 89); cell(readout.bal, x + ctx.measureText('BAL:').width + 2, 89);

      // the stereo field: L against R turned 45° so mono stands upright, stretched to fill the
      // screen as the reference's trace does, over very faint axes
      const cx = 278, cy = 228, rx = 205, ry = 112;
      ctx.strokeStyle = AXIS; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - rx - 15, cy + 0.5); ctx.lineTo(cx + rx + 15, cy + 0.5);
      ctx.moveTo(cx + 0.5, cy - ry - 8); ctx.lineTo(cx + 0.5, cy + ry + 8);
      ctx.stroke();
      ctx.strokeStyle = TRACE; ctx.lineWidth = 1.15; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < l.length; i += 2) {
        const px = cx + Math.max(-1, Math.min(1, (r[i] - l[i]) * 0.9)) * rx;
        const py = cy - Math.max(-1, Math.min(1, (l[i] + r[i]) * 0.9)) * ry;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();

      // to the glass
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.round(canvas.clientWidth * dpr), ch = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      if (gl) {
        gl.viewport(0, 0, cw, ch);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, page);
        gl.uniform1f(uTime, (now / 1000) % 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else flat?.drawImage(page, 0, 0, cw, ch);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{
      // fixed, so on iOS it tracks the visible viewport, not the large one
      position: 'fixed', inset: 0, paddingBottom: PROMPT_BAND,
      overflow: 'hidden', overscrollBehavior: 'contain',
      fontFamily: MONO, color: '#111', background: DESKTOP,
    }}>
      <div style={{
        position: 'absolute', left: '50%', top: `calc(50% - ${PROMPT_BAND / 2}px)`, transform: 'translate(-50%, -50%)',
        width: `min(${W}px, calc(100vw - 32px))`, aspectRatio: `${W} / ${H}`, background: '#000',
      }}>
        <canvas ref={screen} aria-hidden style={{ display: 'block', width: '100%', height: '100%', fontFamily: PIXEL }} />
        <button
          onClick={() => (live ? pause() : broadcastPlay())}
          aria-label={live ? 'Pause the station' : 'Play the station'}
          style={{
            all: 'unset', position: 'absolute', cursor: 'pointer',
            left: `${HIT.left * 100}%`, top: `${HIT.top * 100}%`, width: `${HIT.width * 100}%`, height: `${HIT.height * 100}%`,
          }}
        />
      </div>

      {/* README and RADAR — top-right corner */}
      <Link href="/station/readme" style={{ position: 'absolute', top: 24, right: 24, zIndex: 5, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)', textDecoration: 'none' }}>
        README
      </Link>
      <Link href="/station/radar" style={{ position: 'absolute', top: 44, right: 24, zIndex: 5, fontSize: 12, letterSpacing: '0.08em', color: 'var(--vlg-fg, #000)', textDecoration: 'none' }}>
        RADAR
      </Link>
    </div>
  );
}
