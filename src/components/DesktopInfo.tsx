'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import type { NavCommand } from '@/lib/types';
import { useTheme } from '@/components/ThemeProvider';
import { paletteColor } from '@/lib/theme';

const SW = 1440;
const SH = 1024;

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

// ---------------------------------------------------------------------------
// Content generator — deterministic, varied line lengths, section rhythm
// ---------------------------------------------------------------------------
const h = (a: number, b: number) => Math.abs(Math.sin(a * 997.31 + b * 43.71)) * 0xffff;
const x4 = (a: number, b: number) => `0x${Math.floor(h(a, b)).toString(16).padStart(4, '0').toUpperCase()}`;

function build(): string {
  const x2 = (a: number, b: number) => `0x${Math.floor(h(a, b) % 256).toString(16).padStart(2, '0').toUpperCase()}`;
  const b8 = (a: number, b: number) => Array.from({ length: 8 }, (_, j) => Math.floor(h(a * 7 + b, j)) % 2).join('');
  const flt = (a: number, b: number, lo: number, range: number) => (h(a, b) % range + lo).toFixed(1);

  const STATUS = ['TX', 'STANDBY', 'RX', 'LOCK', 'IDLE'];
  const PATHS  = ['ALT-01', 'ALT-02', 'MAIN-A', 'BACKUP', 'UPLINK'];

  const L: string[] = [];
  const push = (...args: string[]) => args.forEach(a => L.push(a));

  // — body sections — (header is rendered live in JSX, see DesktopInfo)
  let s = 10;
  for (let section = 0; section < 22; section++) {
    s++;
    const t = section % 7;

    if (t === 0) {
      // dense hex rows — varied count and length
      const rows = 2 + Math.floor(h(s, 99) % 3);
      for (let r = 0; r < rows; r++) {
        const n = 10 + Math.floor(h(s + r, 1) % 5);
        push(Array.from({ length: n }, (_, i) => x4(s + r * 4, i)).join(' ') + ' //');
      }

    } else if (t === 1) {
      // signal status + measurement line
      push(
        `FRAME: ${x4(s,0)}   STATUS: ${STATUS[s % 5]}   PATH: ${PATHS[s % 5]}   CHAN: 0${(s % 4) + 1}   SEQ: ${String(s * 7).padStart(6,'0')}`,
        `SNR: ${flt(s,1,28,18)}dB   LEVEL: -${flt(s,2,10,16)}dBfs   PEAK: -${flt(s,3,1,8)}dBfs   RMS: -${flt(s,4,14,12)}dBfs`,
      );

    } else if (t === 2) {
      // binary rows
      const rows = 2 + Math.floor(h(s, 0) % 3);
      for (let r = 0; r < rows; r++) {
        const n = 8 + Math.floor(h(s + r, 2) % 5);
        push(Array.from({ length: n }, (_, i) => b8(s + r * 3, i)).join(' '));
      }

    } else if (t === 3) {
      // mixed technical lines
      push(
        `BIT_ERRORS: 0   FRAME_OK: ${Math.floor(h(s,0) % 3 + 97)}%   CRC: ${x4(s,1)} ${x4(s,2)}   SYNC: LOCKED`,
        Array.from({ length: 9 }, (_, i) => x4(s * 2, i)).join(' ') + `   // ${PATHS[s % 5]}`,
        `COMP: 4.2:1   LAT: ${Math.floor(h(s,5) % 40 + 60)}ms   JITTER: 0.2ms   DROPPED: 0   RESYNC: 0`,
      );

    } else if (t === 4) {
      // short / staccato lines — creates visual variety
      push(
        `${x4(s,0)}: ${STATUS[s % 5]}`,
        `${x4(s,1)} ${x4(s,2)} ${x4(s,3)} ${x4(s,4)}`,
        `NULL ${x2(s,5)} ${x2(s,6)} 0x00 0x00 0x00 // void`,
        `${STATUS[s%5]}_${PATHS[s%5].replace('-','_')}_${x4(s,7)}`,
      );

    } else if (t === 5) {
      // address / memory dump style
      const base = Math.floor(h(s, 0) * 0x8000);
      for (let r = 0; r < 3; r++) {
        const addr = `0x${(base + r * 16).toString(16).toUpperCase().padStart(8,'0')}`;
        const bytes = Array.from({ length: 8 }, (_, i) => x2(s + r, i + 4));
        push(`${addr}  ${bytes.join(' ')}`);
      }

    } else {
      // blank — section breathing room
      push('');
    }

    // rhythmic blank after every 3rd section
    if (section % 3 === 2) push('');
  }

  // — tail —
  push(
    ``,
    `99.00.88.77.66.55.44.33.22.11.00 // end_of_transmission // ${x4(99,0)} ${x4(99,1)}`,
    `null void 0x00000000 0x00000000 0x00000000 0x00000000 0x00000000`,
    `0000000000000000000000000000000000000000000000000000000000000000`,
  );

  return L.join('\n');
}

const CODE_TEXT = build();

const COMMANDS_PREFIX =
  `///////////// end_signal_not_end /////////////////\n` +
  `111000111000111000111000111000111000111000111000111000110\n` +
  `0011100011100\n` +
  `\n` +
  `contact: cloudmain2stock@gmail.com\n` +
  `\n` +
  `commands:`;

const ZEROS_LINE = `0000000000000000000000000000000000000000000000000000000000`;

const GHOST_FRAGMENTS = ['¿¿¿', '0.0', '//void', ':::', '><>', '~/root', '...?'];

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function DesktopInfo({ content, commands }: { content: string; commands: NavCommand[] }) {
  const { T } = useTheme();
  const [scale, setScale] = useState(1);

  // — live UTC clock —
  const [utc, setUtc] = useState('00:00:00Z');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      setUtc(`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // — rare connection-state whisper: STATUS briefly dims to a transit state —
  const [status, setStatus] = useState({ text: 'OK', dim: false });
  useEffect(() => {
    if (reducedMotion()) return;
    const ids: ReturnType<typeof setTimeout>[] = [];
    const cycle = () => {
      setStatus({ text: Math.random() < 0.5 ? 'NEGOTIATING' : 'RE-SYNC', dim: true });
      ids.push(setTimeout(() => setStatus({ text: 'OK', dim: false }), 900 + Math.random() * 500));
      ids.push(setTimeout(cycle, 28000 + Math.random() * 20000));
    };
    ids.push(setTimeout(cycle, 18000 + Math.random() * 12000));
    return () => ids.forEach(clearTimeout);
  }, []);

  // — autonomous ghost-typing at the prompt —
  const [ghost, setGhost] = useState('');
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (reducedMotion()) return;
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => { id = setTimeout(start, 14000 + Math.random() * 16000); };
    const start = () => {
      const frag = GHOST_FRAGMENTS[Math.floor(Math.random() * GHOST_FRAGMENTS.length)];
      setTyping(true);
      let i = 0;
      const type = () => {
        if (i <= frag.length) {
          setGhost(frag.slice(0, i));
          i++;
          id = setTimeout(type, 85 + Math.random() * 60);
        } else {
          i = frag.length;
          id = setTimeout(erase, 900 + Math.random() * 600);
        }
      };
      const erase = () => {
        i--;
        if (i >= 0) {
          setGhost(frag.slice(0, i));
          id = setTimeout(erase, 40 + Math.random() * 30);
        } else {
          setTyping(false);
          schedule();
        }
      };
      type();
    };
    schedule();
    return () => clearTimeout(id);
  }, []);

  const shown = commands.filter(c => !c.hidden);

  // — a command occasionally loses availability —
  const [fading, setFading] = useState(-1);
  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];
    const cycle = () => {
      setFading(Math.floor(Math.random() * shown.length));
      ids.push(setTimeout(() => setFading(-1), 1400 + Math.random() * 800));
      ids.push(setTimeout(cycle, reducedMotion() ? 40000 : 22000 + Math.random() * 18000));
    };
    ids.push(setTimeout(cycle, 20000 + Math.random() * 10000));
    return () => ids.forEach(clearTimeout);
  }, [shown.length]);

  useEffect(() => {
    const update = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      setScale(Math.min(1, vh / SH));
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  const frame: React.CSSProperties = {
    position: 'absolute', top: 0,
    width: SW, height: SH,
    pointerEvents: 'none',
  };

  return (
    <div className="page-enter" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--vlg-bg, #fff)', overflow: 'hidden' }}>

      {/* Left panel — code block, pinned to left viewport edge */}
      <div style={{ ...frame, left: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, width: SW, height: SH,
          overflow: 'hidden',
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 11, lineHeight: '14px',
            color: 'var(--vlg-fg, #000)', whiteSpace: 'pre',
          }}>
            {`MAIN:/vlg/stn/broadcast > signal_check --verbose --all 2>&1\n`}
            {`SESSION: ${x4(1, 0)}   RX_UTC: ${utc}   PATH: ALT-01   PKT_LOSS: 0.00%   BIT_ERR: 0\n`}
            {`TX: ON   FREQ: 99.00MHz   SNR: 40.2dB   LEVEL: -14.1dBfs   STATUS: `}
            <span style={{ color: T.uid_real, opacity: status.dim ? 0.45 : 1, transition: 'opacity .5s ease' }}>{status.text}</span>
            {`\n`}
            {`AUDIO: MPEG4-AAC / 44100Hz / 128kbps   VIDEO: H.264 / 1080p50   SRC: AL-HADATH-LIVE\n`}
            {`BROADCAST_INIT... OK   FRAME_COUNT: 000001   BUFFER: 2048ms   CRC: ${x4(2, 0)} ${x4(2, 1)}\n`}
            {`\n`}
            {CODE_TEXT}
          </div>

          {/* Command instructions — white-backed, pinned to bottom */}
          <div style={{
            position: 'absolute', left: 0, bottom: 0, width: SW,
            background: 'var(--vlg-bg, #fff)', paddingTop: 80, paddingBottom: 8,
          }}>
            <div style={{
              fontFamily: MONO, fontSize: 11, lineHeight: '14px',
              color: 'var(--vlg-fg, #000)', whiteSpace: 'pre',
            }}>
              {COMMANDS_PREFIX}
              {shown.map((c, i) => (
                <div
                  key={c.cmd}
                  style={{ color: paletteColor(T, c.cmd), opacity: fading === i ? 0.15 : 1, transition: 'opacity 1.1s ease' }}
                >
                  {`  ${c.cmd.padEnd(12)} ${c.label}`}
                </div>
              ))}
              {/* two blank lines: spacing + placeholder row for the full-width ticker strip below */}
              {'\n\n' + ZEROS_LINE + '\n'}
              <span style={{ color: T.uid_real }}>
                {`MAIN:/vlg/stn/broadcast > ${ghost}`}
              </span>
              <span style={{
                display: 'inline-block', width: 7, height: 12, background: T.uid_real, verticalAlign: -2,
                animation: typing ? 'none' : 'vr-blink 1s steps(1) infinite',
              }} />
            </div>
          </div>
          <style>{`
            @keyframes vr-blink{50%{opacity:0}}
          `}</style>
        </div>
      </div>

      {/* Right panel — tree/email/arrow, pinned to right viewport edge */}
      <div style={{ ...frame, right: 0, transform: `scale(${scale})`, transformOrigin: 'top right' }}>
        {/* 8-bit tree — centered on email midpoint (120px from right edge) */}
        <div style={{ position: 'absolute', right: 38, top: 35, width: 165, height: 205 }}>
          <Image
            src="/images/tree_8bit.png"
            alt="Village Radio"
            fill
            style={{ objectFit: 'contain' }}
          />
        </div>

        {/* Email — centered under tree */}
        <div style={{
          position: 'absolute', right: 0, top: 252, width: 240,
          textAlign: 'center', fontFamily: MONO, fontSize: 11, color: T.uid_real,
        }}>
          cloudmain2stock@gmail.com
        </div>

        {/* Back arrow — centered on email midpoint */}
        <Link href="/" style={{
          position: 'absolute', right: 95, top: 942,
          display: 'block', width: 50, height: 50,
          pointerEvents: 'auto',
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: 50, height: 50, objectFit: 'contain' }} />
        </Link>
      </div>
    </div>
  );
}
