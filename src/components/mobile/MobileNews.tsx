'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';

const SW = 402;
const SH = 874;

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";
const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.08) 3px)';

export function MobileNews() {
  const [scale, setScale] = useState(1);
  const [centerY, setCenterY] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const vp = window.visualViewport;
      const vw = vp?.width ?? window.innerWidth;
      const vh = vp?.height ?? window.innerHeight;
      const offsetTop = vp?.offsetTop ?? 0;
      setScale(Math.min(vw / SW, document.documentElement.clientHeight / SH));
      setCenterY(offsetTop + vh / 2);
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', overflow: 'hidden' }}>
      <div
        className="page-enter"
        style={{
          position: 'absolute', left: '50%',
          top: centerY !== null ? centerY : '50%',
          width: SW, height: SH,
          transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center center',
        }}
      >
        {/* Back arrow — top-left */}
        <Link href="/" style={{
          position: 'absolute', left: 17, top: 16, display: 'block',
          width: 50, height: 50, zIndex: 10,
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: 50, height: 50, objectFit: 'contain' }} />
        </Link>

        {/* Section label */}
        <div style={{
          position: 'absolute', left: 22, top: 80,
          fontFamily: MONO, fontSize: 8, lineHeight: '10px',
          color: '#000', letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {'// TRANSMISSION_LOG — VLG.FM'}
        </div>

        {/* Newspaper artifact image — IMG_1101 reference component */}
        <div style={{
          position: 'absolute', left: 22, top: 100, width: 358, height: 580,
          overflow: 'hidden',
        }}>
          <Image
            src="/images/IMG_1101.jpg"
            alt=""
            fill
            style={{ objectFit: 'cover', objectPosition: 'top center', filter: 'contrast(1.05)' }}
            sizes="358px"
          />
        </div>

        {/* Bottom info strip */}
        <div style={{
          position: 'absolute', left: 22, top: 694, width: 358,
          fontFamily: MONO, fontSize: 7, lineHeight: '9px',
          color: '#000', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {'VLG/FM — VILLAGE RADIO\n'}
          {'SIGNAL ARCHIVE — ACTIVE\n'}
          {'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'}
          {'cloudmain2stock@gmail.com'}
        </div>

        {/* Date marker */}
        <div style={{
          position: 'absolute', right: 22, top: 694,
          fontFamily: BODY, fontSize: 9, lineHeight: '9px',
          color: '#000', textAlign: 'right',
        }}>
          {'VLGFM.LIVE'}
        </div>

      </div>
      {/* CRT scanlines — on outer container so they cover the full screen */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 1010, pointerEvents: 'none',
        background: SCANLINES, opacity: 0.5,
      }} />
    </div>
  );
}
