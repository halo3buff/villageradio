'use client';

import Link from 'next/link';
import Image from 'next/image';

const SW = 402;
const SH = 874;
const vw = (n: number) => `${(n / SW * 100).toFixed(2)}vw`;
const dvh = (n: number) => `${(n / SH * 100).toFixed(2)}dvh`;

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.08) 3px)';

export function MobileNews() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', overflow: 'hidden' }}>
      <div className="page-enter" style={{ position: 'absolute', inset: 0 }}>

        {/* Back arrow */}
        <Link href="/" style={{
          position: 'absolute', left: vw(17), top: dvh(16), display: 'block',
          width: vw(50), height: vw(50), zIndex: 10,
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: vw(50), height: vw(50), objectFit: 'contain' }} />
        </Link>

        {/* Section label */}
        <div style={{
          position: 'absolute', left: vw(22), top: dvh(80),
          fontFamily: MONO, fontSize: vw(8), lineHeight: dvh(10),
          color: '#000', letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {'// TRANSMISSION_LOG — VLG.FM'}
        </div>

        {/* Newspaper artifact image */}
        <div style={{
          position: 'absolute', left: vw(22), top: dvh(100), width: vw(358), height: dvh(580),
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
          position: 'absolute', left: vw(22), top: dvh(694), width: vw(358),
          fontFamily: MONO, fontSize: vw(7), lineHeight: dvh(9),
          color: '#000', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {'VLG/FM — VILLAGE RADIO\n'}
          {'SIGNAL ARCHIVE — ACTIVE\n'}
          {'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'}
          {'cloudmain2stock@gmail.com'}
        </div>

        {/* Date marker */}
        <div style={{
          position: 'absolute', right: vw(22), top: dvh(694),
          fontFamily: BODY, fontSize: vw(9), lineHeight: dvh(9),
          color: '#000', textAlign: 'right',
        }}>
          {'VLGFM.LIVE'}
        </div>

      </div>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
        background: SCANLINES, opacity: 0.5,
      }} />
    </div>
  );
}
