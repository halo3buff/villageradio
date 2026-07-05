'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MobileStage, px } from '@/components/mobile/MobileStage';

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
const CARD_W = 163;
const CARD_H = 123;

export function MobilePhotography() {
  return (
    <MobileStage zIndex={1000}>
      <div className="page-enter" style={{ position: 'absolute', inset: 0 }}>

        {/* Back arrow */}
        <Link href="/" style={{
          position: 'absolute', left: px(322), top: px(17), display: 'block',
          width: px(50), height: px(50),
        }}>
          <Image src="/icons/left-arrow.png" alt="Back" width={50} height={50}
            style={{ width: px(50), height: px(50), objectFit: 'contain' }} />
        </Link>

        {/* Address / contact text block */}
        <div style={{
          position: 'absolute', left: px(70), top: px(130), width: px(262),
          fontFamily: BODY, fontSize: px(11), lineHeight: px(15),
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

        {/* Stacked thermal cards */}
        {CARDS.map((card, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: px(card.left),
              top: px(card.top),
              width: px(CARD_W),
              height: px(CARD_H),
              overflow: 'hidden',
            }}
          >
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: px(CARD_H),
              height: px(CARD_W),
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
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
        background: SCANLINES, opacity: 0.5,
      }} />
    </MobileStage>
  );
}
