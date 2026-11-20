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

  const send = (msg: object) => frame.current?.contentWindow?.postMessage({ melee: 1, ...msg }, LOCAL_ORIGIN);

  useEffect(() => {
    const onMsg = (e: MessageEvent<Msg>) => {
      if (e.origin !== LOCAL_ORIGIN || !e.data?.melee) return;
      const m = e.data;
      if (m.t === 'link' && m.url) setLink(m.url);
      if (m.t === 'status') { setStatus(m.text ?? ''); if (m.text !== 'FRIEND CONNECTED') setDelay(null); }
      if (m.t === 'delay' && m.ms != null) setDelay(m.ms ? { ms: m.ms, frames: m.frames ?? 0 } : null);
    };
    addEventListener('message', onMsg);
    return () => removeEventListener('message', onMsg);
  }, []);

  const invite = () => { setLink(null); setDelay(null); setCopied(false); send({ t: 'invite' }); };
  const toggleFair = () => { const on = !fair; setFair(on); send({ t: 'fair', on }); };
  const copy = () => { if (link) navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {}); };

  return (
    <main style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', flexDirection: 'column', background: '#000', color: '#fff', fontFamily: MONO, fontSize: 10, lineHeight: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '2px 6px', borderBottom: '1px solid #fff', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span>MELEE.EXE  ONLINE</span>
        <button onClick={invite} style={btn}>[INVITE FRIEND]</button>
        {link && <button onClick={copy} style={btn} title={link}>{copied ? '[LINK COPIED]' : '[COPY LINK]'}</button>}
        {status && <span>{status}</span>}
        {delay && <span>DELAY ~{delay.ms}MS ({delay.frames}F)</span>}
        {/* fairness: holds your controllers back by your friend's delay, so you both play under the same lag */}
        <button onClick={toggleFair} style={btn}>[FAIR: {fair ? 'ON' : 'OFF'}]</button>
        <a href="/" style={{ color: 'inherit', textDecoration: 'none', marginLeft: 'auto' }}>[x]</a>
      </div>
      <div className="crt" style={{ flex: 1, minHeight: 0 }}>
        <iframe ref={frame} src={LOCAL} title="Melee online"
          onLoad={() => send({ t: 'hello' })}
          allow="cross-origin-isolated; gamepad; hid; fullscreen; autoplay; local-network-access; local-network; loopback-network"
          style={{ display: 'block', width: '100%', height: '100%', border: 'none' }} />
      </div>
    </main>
  );
}
