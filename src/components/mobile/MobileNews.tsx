'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MobileStage, px } from '@/components/mobile/MobileStage';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.08) 3px)';

export function MobileNews() {
  return (
    <MobileStage zIndex={1000}>
      <div className="page-enter" style={{ position: 'absolute', inset: 0 }}>

        {/* Back arrow */}
        <Link href="/" style={{
          position: 'absolute', left: px(17), top: px(16), display: 'block',
          width: px(50), height: px(50), zIndex: 10,
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: px(50), height: px(50), objectFit: 'contain' }} />
        </Link>

        {/* Section label */}
        <div style={{
          position: 'absolute', left: px(22), top: px(80),
          fontFamily: MONO, fontSize: px(8), lineHeight: px(10),
          color: '#000', letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {'// TRANSMISSION_LOG — VLG.FM'}
        </div>

        {/* Newspaper artifact image */}
        <div style={{
          position: 'absolute', left: px(22), top: px(100), width: px(358), height: px(580),
          overflow: 'hidden',
        }}>
          <Image
            src="/images/IMG_1101.jpg"
            alt=""
            fill
            style={{ objectFit: 'cover', objectPosition: 'top center', filter: 'contrast(1.05)' }}
            sizes="90vw"
          />
        </div>

        {/* Bottom info strip */}
        <div style={{
          position: 'absolute', left: px(22), top: px(694), width: px(358),
          fontFamily: MONO, fontSize: px(7), lineHeight: px(9),
          color: '#000', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {'VLG/FM — VILLAGE RADIO\n'}
          {'SIGNAL ARCHIVE — ACTIVE\n'}
          {'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'}
          {'cloudmain2stock@gmail.com'}
        </div>

        {/* Date marker */}
        <div style={{
          position: 'absolute', right: px(22), top: px(694),
          fontFamily: BODY, fontSize: px(9), lineHeight: px(9),
          color: '#000', textAlign: 'right',
        }}>
          {'VLGFM.LIVE'}
        </div>

      </div>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
        background: SCANLINES, opacity: 0.5,
      }} />
    </MobileStage>
  );
}
