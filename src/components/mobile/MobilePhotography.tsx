'use client';

import Link from 'next/link';
import Image from 'next/image';

const SW = 402;
const SH = 874;
const vw = (n: number) => `${(n / SW * 100).toFixed(2)}vw`;
const dvh = (n: number) => `${(n / SH * 100).toFixed(2)}dvh`;

const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';

const SCANLINES =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.08) 3px)';

const IMG = '/images/photography/IMG_3961.jpg';
const CARDS = [
  { left: 80,  top: 316 },
  { left: 130, top: 369 },
  { left: 130, top: 438 },
  { left: 130, top: 514 },
  { left: 130, top: 590 },
  { left: 179, top: 643 },
];
// Maintain card aspect ratio with vw units on both axes
const CARD_W = 163;
const CARD_H = 123;

export function MobilePhotography() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', overflow: 'hidden' }}>
      <div className="page-enter" style={{ position: 'absolute', inset: 0 }}>

        {/* Back arrow */}
        <Link href="/" style={{
          position: 'absolute', left: vw(322), top: dvh(17), display: 'block',
          width: vw(50), height: vw(50),
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: vw(50), height: vw(50), objectFit: 'contain' }} />
        </Link>

        {/* Address / contact text block */}
        <div style={{
          position: 'absolute', left: vw(70), top: dvh(130), width: vw(262),
          fontFamily: BODY, fontSize: vw(11), lineHeight: dvh(15),
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

        {/* Stacked thermal cards — both W and H use vw to preserve aspect ratio */}
        {CARDS.map((card, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: vw(card.left),
              top: dvh(card.top),
              width: vw(CARD_W),
              height: vw(CARD_H),
              overflow: 'hidden',
            }}
          >
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: vw(CARD_H),
              height: vw(CARD_W),
              transform: 'translate(-50%, -50%) rotate(90deg)',
            }}>
              <Image
                src={IMG}
                alt=""
                fill
                style={{ objectFit: 'cover' }}
                sizes={`${(CARD_H / SW * 100).toFixed(0)}vw`}
              />
            </div>
          </div>
        ))}

      </div>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
        background: SCANLINES, opacity: 0.5,
      }} />
    </div>
  );
}
