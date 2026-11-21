'use client';

import { useEffect, useRef, useState } from 'react';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
// Each player's own melee-web build, served on their own machine by its serve.py. Nothing of the
// game passes through this site: it frames the host's local copy, whose stream-host.mjs does the
// inviting; this bar only asks it to and shows what it says.
const LOCAL = 'http://127.0.0.1:5191/';
const LOCAL_ORIGIN = 'http://127.0.0.1:5191';

type Msg = { melee: 1; t: string; url?: string; text?: string; ms?: number; frames?: number; fair?: boolean };

const btn: React.CSSProperties = { font: 'inherit', color: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer' };

export function MeleeOnline() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [link, setLink] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [delay, setDelay] = useState<{ ms: number; frames: number } | null>(null);
  const [fair, setFair] = useState(false);
  const [copied, setCopied] = useState(false);
  const [controls, setControls] = useState(false);   // the copy's own keyboard/controller bar, hidden in here by default
  // Is the player's own copy answering? It says 'ready' when greeted; silence means it isn't running.
  const [up, setUp] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  // after [START MY COPY], look again every few seconds until the copy answers
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!starting || up) return;
    const t = setTimeout(() => setAttempt((a) => a + 1), 3000);
    return () => clearTimeout(t);
  }, [starting, up, attempt]);
  useEffect(() => {
    setUp(null);
    const t = setTimeout(() => setUp((u) => u ?? false), 4000);
    return () => clearTimeout(t);
  }, [attempt]);

  const send = (msg: object) => frame.current?.contentWindow?.postMessage({ melee: 1, ...msg }, LOCAL_ORIGIN);

  useEffect(() => {
    const onMsg = (e: MessageEvent<Msg>) => {
      if (e.origin !== LOCAL_ORIGIN || !e.data?.melee) return;
      const m = e.data;
      if (m.t === 'ready') setUp(true);
      if (m.t === 'link' && m.url) setLink(m.url);
      if (m.t === 'status') { setStatus(m.text ?? ''); if (m.text !== 'FRIEND CONNECTED') setDelay(null); }
      if (m.t === 'delay' && m.ms != null) setDelay(m.ms ? { ms: m.ms, frames: m.frames ?? 0 } : null);
    };
    addEventListener('message', onMsg);
    return () => removeEventListener('message', onMsg);
  }, []);

  const invite = () => { setLink(null); setDelay(null); setCopied(false); send({ t: 'invite' }); };
  const toggleFair = () => { const on = !fair; setFair(on); send({ t: 'fair', on }); };
  const toggleControls = () => { const on = !controls; setControls(on); send({ t: 'controls', on }); };
  const copy = () => { if (link) navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {}); };

  return (
    <main style={{ position: 'fixed', inset: 0, zIndex: 3000 }}>
      {/* a window fitted to Melee's 73:60 picture (the copy crops its 4:3 frame to it): the screen's
          height sets it, the title bar (19px) on top */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        height: 'min(80vh, 760px)', width: 'min(calc((min(80vh, 760px) - 19px) * 73 / 60), 94vw)', display: 'flex', flexDirection: 'column',
        fontFamily: MONO, fontSize: 10, lineHeight: '14px', color: 'var(--vlg-fg, #000)', background: '#000', border: '1px solid currentColor',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '2px 6px', borderBottom: '1px solid currentColor', background: 'var(--vlg-bg, #fff)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span>MELEE.EXE  ONLINE</span>
        <button onClick={invite} style={btn}>[INVITE FRIEND]</button>
        {link && <button onClick={copy} style={btn} title={link}>{copied ? '[LINK COPIED]' : '[COPY LINK]'}</button>}
        {status && <span>{status}</span>}
        {delay && <span>DELAY ~{delay.ms}MS ({delay.frames}F)</span>}
        {/* fairness: holds your controllers back by your friend's delay, so you both play under the same lag */}
        <button onClick={toggleFair} style={btn}>[FAIR: {fair ? 'ON' : 'OFF'}]</button>
        <button onClick={toggleControls} style={btn}>[CONTROLS{controls ? ': ON' : ''}]</button>
        <a href="/" style={{ color: 'inherit', textDecoration: 'none', marginLeft: 'auto' }}>[x]</a>
      </div>
      <div className="crt" style={{ flex: 1, minHeight: 0 }}>
        <iframe key={attempt} ref={frame} src={LOCAL} title="Melee online"
          onLoad={() => send({ t: 'hello' })}
          allow="cross-origin-isolated; gamepad; hid; fullscreen; autoplay; local-network-access; local-network; loopback-network"
          style={{ display: 'block', width: '100%', height: '100%', border: 'none' }} />
        {up === false && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: '#000', color: '#fff', fontSize: 11, lineHeight: '16px', textAlign: 'center', padding: 16,
          }}>
            <span>{starting ? 'STARTING YOUR MELEE COPY…' : 'YOUR MELEE COPY ISN’T RUNNING.'}</span>
            {/* vlgmelee: is registered on the player's own PC; it starts their copy in the background */}
            {!starting && <a href="vlgmelee://start" onClick={() => setStarting(true)} style={{ color: 'inherit', textDecoration: 'none' }}>[START MY COPY]</a>}
            <button onClick={() => setAttempt((a) => a + 1)} style={{ ...btn, fontSize: 11, opacity: 0.7 }}>[TRY AGAIN]</button>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
