'use client';

import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const SIGNAL = 'wss://melee-netplay.melee-netplay-worker.workers.dev';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ROOM = /^[A-Z2-7]{8}$/;

// The friend's side of a vlgfm.live Melee stream. Nothing of the game is here: the host's own copy
// runs on the host's computer and sends its picture; this page shows it and sends back one
// controller, in the GameCube adapter's 9-byte port format the host's engine reads.

// Keyboard, the same layout as the game's own page.
const KEYS: Record<string, [number, number]> = { // code -> [byte, bit]
  KeyX: [1, 0x01], KeyZ: [1, 0x02], KeyC: [1, 0x04], KeyV: [1, 0x08],          // A B X Y
  KeyF: [1, 0x10], KeyH: [1, 0x20], KeyG: [1, 0x40], KeyT: [1, 0x80],          // d-pad left right down up
  Enter: [2, 0x01], Tab: [2, 0x02], KeyE: [2, 0x04], KeyQ: [2, 0x08],          // Start Z R L
};
const STICK = { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'] };
const CSTICK = { left: ['KeyJ'], right: ['KeyL'], up: ['KeyI'], down: ['KeyK'] };
const USED = new Set([...Object.keys(KEYS), ...Object.values(STICK).flat(), ...Object.values(CSTICK).flat()]);

const axis = (v: number) => Math.max(0, Math.min(255, Math.round(128 + v * 80)));

function readPad(keys: Set<string>): Uint8Array {
  const s = Uint8Array.of(0x10, 0, 0, 128, 128, 128, 128, 0, 0);
  for (const code of keys) { const k = KEYS[code]; if (k) s[k[0]] |= k[1]; }
  const dir = (m: typeof STICK) => {
    const on = (list: string[]) => list.some((c) => keys.has(c));
    return [(on(m.right) ? 1 : 0) - (on(m.left) ? 1 : 0), (on(m.up) ? 1 : 0) - (on(m.down) ? 1 : 0)];
  };
  let [x, y] = dir(STICK); let [cx, cy] = dir(CSTICK);
  if (s[2] & 0x08) s[7] = 140;   // L
  if (s[2] & 0x04) s[8] = 140;   // R
  // A standard-layout gamepad, if one is plugged in, adds to the keyboard.
  for (const g of navigator.getGamepads?.() ?? []) {
    if (!g || g.mapping !== 'standard') continue;
    const b = (i: number) => !!g.buttons[i]?.pressed;
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    if (b(0)) s[1] |= 0x01; if (b(2)) s[1] |= 0x02; if (b(1)) s[1] |= 0x04; if (b(3)) s[1] |= 0x08;
    if (b(14)) s[1] |= 0x10; if (b(15)) s[1] |= 0x20; if (b(13)) s[1] |= 0x40; if (b(12)) s[1] |= 0x80;
    if (b(9)) s[2] |= 0x01; if (b(5)) s[2] |= 0x02;
    const lt = g.buttons[6]?.value ?? 0, rt = g.buttons[7]?.value ?? 0;
    if (lt > 0.9) s[2] |= 0x08; if (rt > 0.9) s[2] |= 0x04;
    s[7] = Math.max(s[7], Math.round(lt * 140)); s[8] = Math.max(s[8], Math.round(rt * 140));
    if (!x && !y) { x = dz(g.axes[0] ?? 0); y = -dz(g.axes[1] ?? 0); }
    if (!cx && !cy) { cx = dz(g.axes[2] ?? 0); cy = -dz(g.axes[3] ?? 0); }
  }
  s[3] = axis(x); s[4] = axis(y); s[5] = axis(cx); s[6] = axis(cy);
  return s;
}

export function MeleeJoin() {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('CONNECTING');
  const [delay, setDelay] = useState<number | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const room = new URLSearchParams(location.search).get('room') ?? '';
    if (!ROOM.test(room)) { setStatus('THIS INVITE LINK IS BROKEN'); return; }
    const own = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALPHABET[b & 31]).join('');
    const keys = new Set<string>();
    let pc: RTCPeerConnection | null = null;
    let pads: RTCDataChannel | null = null;
    let ctl: RTCDataChannel | null = null;
    let seq = 0, raf = 0, rtt = 0, done = false;
    const timers: ReturnType<typeof setInterval>[] = [];

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (!USED.has(e.code)) return;
      e.preventDefault();
      if (down) keys.add(e.code); else keys.delete(e.code);
    };
    const kd = onKey(true), ku = onKey(false), blur = () => keys.clear();
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', blur);

    // Every frame: the whole pad state, numbered; the host keeps only the newest.
    const loop = () => {
      if (pads?.readyState === 'open') {
        const out = new Uint8Array(11);
        out[0] = seq & 255; out[1] = (seq >> 8) & 255; seq = (seq + 1) & 0xffff;
        out.set(readPad(keys), 2);
        pads.send(out);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    (async () => {
      const ice = await fetch(SIGNAL.replace('wss:', 'https:') + '/ice').then((r) => r.json()).then((j) => j.iceServers).catch(() => [{ urls: 'stun:stun.cloudflare.com:3478' }]);
      if (done) return;
      const ws = new WebSocket(`${SIGNAL}/room/${room}?role=guest&code=${own}&v=1`);
      ws.onerror = () => setStatus('COULD NOT REACH THE HOST');
      ws.onmessage = async (e) => {
        if (typeof e.data !== 'string') return;
        const m = JSON.parse(e.data);
        if (m.t === 'error') setStatus(String(m.reason).toUpperCase());
        if (m.t === 'waiting') setStatus('WAITING FOR HOST');
        if (m.t === 'peer-left') setStatus('HOST LEFT');
        if (m.t === 'ice' && m.c) await pc?.addIceCandidate(m.c).catch(() => {});
        if (m.t !== 'offer') return;
        pc?.close();
        pc = new RTCPeerConnection({ iceServers: ice, bundlePolicy: 'max-bundle' });
        pc.onicecandidate = (ev) => ev.candidate && ws.send(JSON.stringify({ t: 'ice', c: ev.candidate }));
        pc.onconnectionstatechange = () => {
          if (pc?.connectionState === 'connected') setStatus('CONNECTED');
          if (pc?.connectionState === 'failed') setStatus('COULD NOT CONNECT');
        };
        // Show frames the moment they decode: no playout buffer.
        pc.ontrack = (ev) => {
          const r = ev.receiver as RTCRtpReceiver & { jitterBufferTarget?: number; playoutDelayHint?: number };
          try { r.jitterBufferTarget = 0; } catch {}
          try { r.playoutDelayHint = 0; } catch {}
          const v = video.current;
          if (!v) return;
          const stream = (v.srcObject as MediaStream | null) ?? new MediaStream();
          stream.addTrack(ev.track);
          v.srcObject = stream;
          v.play().catch(() => {});
        };
        pc.ondatachannel = (ev) => {
          if (ev.channel.label === 'pad') { pads = ev.channel; pads.binaryType = 'arraybuffer'; }
          if (ev.channel.label === 'ctl') {
            ctl = ev.channel;
            ctl.onmessage = (me) => {
              const msg = JSON.parse(me.data);
              if (msg.t === 'pong') rtt = rtt ? rtt * 0.8 + (performance.now() - msg.at) * 0.2 : performance.now() - msg.at;
            };
          }
        };
        await pc.setRemoteDescription(m.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        ws.send(JSON.stringify({ t: 'answer', sdp: pc.localDescription }));
      };

      // Delay: a press travels to the host and its picture comes back (the round trip), plus the
      // time this browser holds and decodes each frame, plus the host's frame.
      timers.push(setInterval(() => { if (ctl?.readyState === 'open') ctl.send(JSON.stringify({ t: 'ping', at: performance.now() })); }, 500));
      timers.push(setInterval(async () => {
        if (!pc || !rtt || ctl?.readyState !== 'open') return;
        let held = 0;
        (await pc.getStats()).forEach((r) => {
          if (r.type === 'inbound-rtp' && r.kind === 'video' && r.jitterBufferEmittedCount && r.framesDecoded) {
            held = (r.jitterBufferDelay / r.jitterBufferEmittedCount + r.totalDecodeTime / r.framesDecoded) * 1000;
          }
        });
        const ms = Math.round(rtt + held + 1000 / 60);
        setDelay(ms);
        ctl.send(JSON.stringify({ t: 'delay', ms }));
      }, 2000));
    })();

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearInterval);
      removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', blur);
      pc?.close();
    };
  }, []);

  const start = () => {
    const v = video.current;
    if (v) { v.muted = false; v.play().catch(() => {}); }
    setStarted(true);
  };

  return (
    <main style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', flexDirection: 'column', background: '#000', color: '#fff', fontFamily: MONO, fontSize: 10, lineHeight: '14px' }}>
      <div style={{ display: 'flex', gap: 14, padding: '2px 6px', borderBottom: '1px solid #fff', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span>MELEE.EXE  JOIN</span>
        <span>{status}</span>
        {delay != null && <span>DELAY ~{delay}MS</span>}
        <span style={{ marginLeft: 'auto', opacity: 0.7 }}>STICK WASD/ARROWS · A X · B Z · X C · Y V · L Q · R E · Z TAB · START ENTER · C IJKL · OR A CONTROLLER</span>
      </div>
      <div className="crt" style={{ flex: 1, minHeight: 0 }}>
        <video ref={video} autoPlay playsInline muted
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }} />
        {!started && (
          <button onClick={start} style={{
            position: 'absolute', inset: 0, font: 'inherit', fontSize: 13, color: '#fff', background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer',
          }}>[ CLICK TO PLAY ]</button>
        )}
      </div>
    </main>
  );
}
