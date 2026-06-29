'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';

const SW = 402;
const SH = 874;

const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.08) 3px)';

// Six cards — same image, rotated 90° CW. Positions from Figma node 2096:5.
// Outer container is landscape (163×123); inner portrait div (123×163) rotates 90° CW
// so the image fills the outer box as a landscape crop.
const IMG = '/images/photography/IMG_3961.jpg';
const CARDS = [
  { left: 80,  top: 316 },
  { left: 130, top: 369 },
  { left: 130, top: 438 },
  { left: 130, top: 514 },
  { left: 130, top: 590 },
  { left: 179, top: 643 },
];

const CARD_W = 163;
const CARD_H = 123;

export function MobilePhotography() {
  const [scale, setScale] = useState(1);
  const [centerY, setCenterY] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const vp = window.visualViewport;
      const vw = vp?.width ?? window.innerWidth;
      const visualVh = vp?.height ?? window.innerHeight;
      const layoutH = window.innerHeight;
      const offsetTop = vp?.offsetTop ?? 0;
      setScale(Math.min(vw / SW, layoutH / SH));
      setCenterY(offsetTop + visualVh / 2);
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
        {/* Back arrow — Figma node 2096:5 left=322, top=17 */}
        <Link href="/" style={{
          position: 'absolute', left: 322, top: 17, display: 'block',
          width: 50, height: 50,
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: 50, height: 50, objectFit: 'contain' }} />
        </Link>

        {/* Address / contact text block — centered, y=138–231 */}
        <div style={{
          position: 'absolute', left: 70, top: 130, width: 262,
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

        {/* Six stacked thermal cards — positions from Figma node 2096:5.
            Outer div: landscape CARD_W×CARD_H.
            Inner div: portrait CARD_H×CARD_W, rotated 90° CW so image fills as landscape. */}
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
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: CARD_H,
              height: CARD_W,
              transform: 'translate(-50%, -50%) rotate(90deg)',
            }}>
              <Image
                src={IMG}
                alt=""
                fill
                style={{ objectFit: 'cover' }}
                sizes={`${CARD_H}px`}
              />
            </div>
          </div>
        ))}

      </div>
      {/* CRT scanlines — on outer container so they cover the full screen */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 1010, pointerEvents: 'none',
        background: SCANLINES, opacity: 0.5,
      }} />
    </div>
  );
}
