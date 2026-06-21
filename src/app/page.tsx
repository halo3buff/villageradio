import Link from 'next/link';
import { SootSprite } from '@/components/SootSprite';
import { FitStage } from '@/components/FitStage';
import { HeaderCluster } from '@/components/HeaderCluster';
import { LissajousScope } from '@/components/LissajousScope';

const DISPLAY = 'var(--font-hn-black), "Helvetica Neue", Arial, sans-serif';
const BODY = 'var(--font-hn-medium), "Helvetica Neue", Arial, sans-serif';
const RED = '#ff0000';

// Inline red link used inside the justified body copy
function RedLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} style={{ color: RED, textDecoration: 'none' }}>
      {children}
    </Link>
  );
}

export default function Home() {
  return (
    <>
      {/* Hidden admin entry — homepage only (secret key sequence → sprite → login overlay) */}
      <SootSprite />

      <FitStage
        left={
          <>
            {/* Vectorscope — grid lands at X=274 Y=334; header bar sits just above */}
            <div style={{ position: 'absolute', left: 274, top: 300, pointerEvents: 'auto' }}>
              <LissajousScope size={430} />
            </div>

            {/* send transmission — X=33 Y=847, HN Black 36, -13% tracking */}
            <Link
              href="/transmit"
              style={{
                position: 'absolute',
                left: 33,
                top: 847,
                pointerEvents: 'auto',
                fontFamily: DISPLAY,
                fontSize: 36,
                lineHeight: 1,
                letterSpacing: '-0.13em',
                color: '#000000',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              send transmission
            </Link>
          </>
        }
        right={
          <>
            {/* VILLAGE RADIO logo cluster — top right */}
            <HeaderCluster />

            {/* Right-hand justified body copy — X=1178 Y=208 W=194, HN Medium 20 */}
            <div
              style={{
                position: 'absolute',
                left: 1178,
                top: 208,
                width: 194,
                pointerEvents: 'auto',
                fontFamily: BODY,
                fontSize: 20,
                lineHeight: '23px',
                letterSpacing: '-0.01em',
                textAlign: 'justify',
                textTransform: 'uppercase',
                color: '#000000',
              }}
            >
              {'Finding a balance in the digital age requires a conscious effort to log off. If you want to protect your mental health, you have to learn to '}
              <RedLink href="/listen">listen</RedLink>
              {' to your body’s need for a break. Spend less time scrolling through the daily '}
              <RedLink href="/news">news</RedLink>
              {' cycle or stressing over your professional '}
              <RedLink href="/work">work</RedLink>
              {'. Instead, channel that energy into a creative hobby that keeps you present in the physical world, whether that means exploring local trails, practicing amateur '}
              <RedLink href="/photography">photography</RedLink>
              {', or learning to cook a new meal.'}
            </div>
          </>
        }
      />
    </>
  );
}
