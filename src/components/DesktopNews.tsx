'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';

const SW = 1440;
const SH = 1024;

export function DesktopNews() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(1, window.innerWidth / SW, window.innerHeight / SH));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', overflow: 'hidden' }}>
      <div
        className="page-enter"
        style={{
          position: 'absolute', left: '50%', top: '50%', width: SW, height: SH,
          transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center center',
        }}
      >
        {/* Newspaper photo — left-aligned, vertically centered */}
        <div style={{
          position: 'absolute', left: 284, top: 43, width: 845, height: 938,
          overflow: 'hidden',
        }}>
          <Image
            src="/images/IMG_1101.jpg"
            alt=""
            fill
            style={{ objectFit: 'cover', objectPosition: 'top center' }}
            sizes="845px"
          />
        </div>

        {/* Back arrow — bottom-right */}
        <Link href="/" style={{
          position: 'absolute', left: 1355, top: 958, display: 'block',
          width: 50, height: 50,
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: 50, height: 50, objectFit: 'contain' }} />
        </Link>
      </div>
    </div>
  );
}
