'use client';

import Link from 'next/link';
import Image from 'next/image';

const SW = 402;
const SH = 874;
const vw = (n: number) => `${(n / SW * 100).toFixed(2)}vw`;
const dvh = (n: number) => `${(n / SH * 100).toFixed(2)}dvh`;

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

const STRIPES = 'repeating-linear-gradient(90deg, #000 0px, #000 1px, #fff 1px, #fff 2px)';

const BOTTOM_TEXT =
  '///////////// end_signal_not_end /////////////////\n' +
  '111000111000111000111000111000111000111000111000111000110\n' +
  '0011100011100\n' +
  'cloudmain2stock@gmail.com\n' +
  '99.00.88.77.66.55.44.33.22.11.00.err.null.void.0x0000000000000000\n' +
  '0000000000000000000000000000000000000000000000000000000000';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MobileInfo({ content }: { content: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', overflow: 'hidden' }}>
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
          background: '#fff', paddingBottom: 4,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: vw(8), lineHeight: dvh(10),
            color: '#000', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {BOTTOM_TEXT}
          </div>
        </div>

      </div>
    </div>
  );
}
