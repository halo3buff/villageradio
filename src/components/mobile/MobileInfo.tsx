'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MobileStage, px } from '@/components/mobile/MobileStage';

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
    <MobileStage zIndex={1000}>
      <div className="page-enter" style={{ position: 'absolute', inset: 0 }}>

        {/* Back arrow */}
        <Link href="/" style={{
          position: 'absolute', left: px(17), top: px(16), display: 'block',
          width: px(50), height: px(50),
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: px(50), height: px(50), objectFit: 'contain' }} />
        </Link>

        {/* Stripe background */}
        <div style={{
          position: 'absolute', left: px(22), top: px(82), width: px(354), height: px(746),
          background: STRIPES,
        }} />

        {/* 8-bit tree */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: px(218),
          width: px(175),
          height: px(175),
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
          position: 'absolute', left: px(22), top: px(733), width: px(354),
          background: '#fff', paddingBottom: 4,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: px(8), lineHeight: px(10),
            color: '#000', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {BOTTOM_TEXT}
          </div>
        </div>

      </div>
    </MobileStage>
  );
}
