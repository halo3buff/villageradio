'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { NavCommand } from '@/lib/types';
import { useTheme } from '@/components/ThemeProvider';
import { paletteColor } from '@/lib/theme';

const SW = 402;
const SH = 874;
const vw = (n: number) => `${(n / SW * 100).toFixed(2)}vw`;
const dvh = (n: number) => `${(n / SH * 100).toFixed(2)}dvh`;

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

const STRIPES = 'repeating-linear-gradient(90deg, var(--vlg-fg, #000) 0px, var(--vlg-fg, #000) 1px, var(--vlg-bg, #fff) 1px, var(--vlg-bg, #fff) 2px)';

const BOTTOM_HEADER =
  '///////////// end_signal_not_end /////////////////\n' +
  '111000111000111000111000111000111000111000111000111000110\n' +
  '0011100011100\n';

const EMAIL = 'cloudmain2stock@gmail.com';

const BOTTOM_SUFFIX =
  '99.00.88.77.66.55.44.33.22.11.00.err.null.void.0x0000000000000000\n' +
  '0000000000000000000000000000000000000000000000000000000000';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MobileInfo({ content, commands }: { content: string; commands: NavCommand[] }) {
  const { T } = useTheme();
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--vlg-bg, #fff)', overflow: 'hidden' }}>
      <div className="page-enter" style={{ position: 'absolute', inset: 0 }}>

        {/* Back arrow */}
        <Link href="/" style={{
          position: 'absolute', left: vw(17), top: dvh(16), display: 'block',
          width: vw(50), height: vw(50),
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: vw(50), height: vw(50), objectFit: 'contain' }} />
        </Link>

        {/* Stripe background */}
        <div style={{
          position: 'absolute', left: vw(22), top: dvh(82), width: vw(354), height: dvh(746),
          background: STRIPES,
        }} />

        {/* 8-bit tree */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: dvh(218),
          width: vw(175),
          height: vw(175),
          transform: 'translateX(-50%)',
        }}>
          <Image
            src="/images/tree_8bit.png"
            alt="Village Radio"
            fill
            style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
          />
        </div>

        {/* Bottom text block */}
        <div style={{
          position: 'absolute', left: vw(22), top: dvh(733), width: vw(354),
          background: 'var(--vlg-bg, #fff)', paddingBottom: 4,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: vw(8), lineHeight: dvh(10),
            color: 'var(--vlg-fg, #000)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {BOTTOM_HEADER}
            {'contact: '}
            <span style={{ color: T.uid_real }}>{EMAIL}</span>
            {'\ncommands:\n'}
            {commands.map(c => (
              <div key={c.cmd} style={{ color: paletteColor(T, c.cmd) }}>
                {`  ${c.cmd.padEnd(12)} ${c.label}`}
              </div>
            ))}
            {'\n' + BOTTOM_SUFFIX}
          </div>
        </div>

      </div>
    </div>
  );
}
