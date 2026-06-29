'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';

const SW = 402;
const SH = 874;

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

// Vertical stripe background — 1px black / 1px white repeating columns
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
  const [scale, setScale] = useState(1);
  const [centerY, setCenterY] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const vp = window.visualViewport;
      const vw = vp?.width ?? window.innerWidth;
      const vh = vp?.height ?? window.innerHeight;
      const offsetTop = vp?.offsetTop ?? 0;
      setScale(vw / SW);
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
        {/* Back arrow — top-left, standard 50×50 */}
        <Link href="/" style={{
          position: 'absolute', left: 17, top: 16, display: 'block',
          width: 50, height: 50,
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: 50, height: 50, objectFit: 'contain' }} />
        </Link>

        {/* Stripe background — left=22, top=82, w=354, h=746 */}
        <div style={{
          position: 'absolute', left: 22, top: 82, width: 354, height: 746,
          background: STRIPES,
        }} />

        {/* 8-bit tree — placed directly on stripes at 175×175 so the PNG's own
            transparent outer edge creates a tree-shaped white cutout (no square bg div) */}
        <div style={{
          position: 'absolute',
          left: Math.round((SW - 175) / 2),
          top: 218,
          width: 175,
          height: 175,
        }}>
          <Image
            src="/images/tree_8bit.png"
            alt="Village Radio"
            fill
            style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
          />
        </div>

        {/* Bottom text block — white bg over stripes, starts at y=733 */}
        <div style={{
          position: 'absolute', left: 22, top: 733, width: 354,
          background: '#fff', paddingBottom: 4,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 8, lineHeight: '10px',
            color: '#000', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {BOTTOM_TEXT}
          </div>
        </div>
      </div>
    </div>
  );
}
