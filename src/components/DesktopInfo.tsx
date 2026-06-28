'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';

const SW = 1440;
const SH = 1024;

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

export function DesktopInfo({ content }: { content: string }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(1, window.innerWidth / SW, window.innerHeight / SH));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Repeat content enough times to fill the left column
  const filled = Array(60).fill(content).join(' ');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', overflow: 'hidden' }}>
      <div
        className="page-enter"
        style={{
          position: 'absolute', left: '50%', top: '50%', width: SW, height: SH,
          transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center center',
        }}
      >
        {/* Dense text content — fills left ~76% of page */}
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 1100, height: SH,
          overflow: 'hidden', pointerEvents: 'none',
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 8, lineHeight: '10px',
            color: '#000', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {filled}
          </div>
        </div>

        {/* 8-bit tree — right column, black */}
        <div style={{
          position: 'absolute',
          left: 1190,
          top: 35,
          width: 165,
          height: 205,
        }}>
          <Image
            src="/images/tree_8bit.png"
            alt="Village Radio"
            fill
            style={{ objectFit: 'contain' }}
          />
        </div>

        {/* Email below tree */}
        <div style={{
          position: 'absolute',
          left: 1140,
          top: 252,
          width: 280,
          textAlign: 'center',
          fontFamily: MONO,
          fontSize: 11,
          color: '#000',
        }}>
          cloudmain2stock@gmail.com
        </div>

        {/* Back arrow — bottom-right */}
        <Link href="/" style={{
          position: 'absolute', left: 1260, top: 942, display: 'block',
          width: 50, height: 50,
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: 50, height: 50, objectFit: 'contain' }} />
        </Link>
      </div>
    </div>
  );
}
