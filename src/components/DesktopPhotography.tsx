'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import type { Photo } from '@/lib/types';
import { photoUrl } from '@/lib/content/media';

const SW = 1440;
const SH = 1024;

const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.06) 3px)';

// 5 image cards in a horizontal strip at the bottom.
// Strip: x=78, y=593, total width=1362, height=330.
// Each card: 272×330 (landscape outer). Same rotation trick as mobile.
const FALLBACK_IMG = '/images/photography/negative/IMG_3961.jpg';
const CARD_W = 272;
const CARD_H = 330;
const CARDS = [78, 350, 622, 894, 1166].map(left => ({ left, top: 593 }));

export function DesktopPhotography({ photos }: { photos: Photo[] }) {
  const imgFor = (i: number) =>
    photos.length > 0 ? photoUrl(photos[i % photos.length]!.key) : FALLBACK_IMG;

  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      setScale(Math.min(1, vw / SW, vh / SH));
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
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
        {/* Back arrow — Figma: x=1356, y=39 */}
        <Link href="/" style={{
          position: 'absolute', left: 1356, top: 39, display: 'block',
          width: 50, height: 50,
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: 50, height: 50, objectFit: 'contain' }} />
        </Link>

        {/* Address / contact text block — Figma: x=449, y=300, ~w=195 */}
        <div style={{
          position: 'absolute', left: 449, top: 300, width: 195,
          fontFamily: BODY, fontSize: 11, lineHeight: '15px',
          color: '#000', textTransform: 'uppercase', textAlign: 'center',
          whiteSpace: 'pre',
        }}>
          {[
            '932 CANAVARY  WAY',
            'GULLAGULLA ISLAND, TG 429872',
            '3           NY  -  USA           1',
            '2                                 2',
            '1           ESTUS                 3',
            '+  00   1    823   429   8572',
            '        DOTKOM.WEB',
          ].join('\n')}
        </div>

        {/* Five horizontal thermal image cards — x=78, y=593, each 272×330 */}
        {CARDS.map((card, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: card.left,
              top: card.top,
              width: CARD_W,
              height: CARD_H,
              overflow: 'hidden',
            }}
          >
            {/* Inner portrait div rotated 90° CW so landscape card shows correctly */}
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: CARD_H,
              height: CARD_W,
              transform: 'translate(-50%, -50%) rotate(90deg)',
            }}>
              <Image
                src={imgFor(i)}
                alt=""
                fill
                style={{ objectFit: 'cover' }}
                sizes={`${CARD_H}px`}
              />
            </div>
          </div>
        ))}

        {/* CRT scanlines */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none',
          background: SCANLINES, opacity: 0.4,
        }} />
      </div>
    </div>
  );
}
