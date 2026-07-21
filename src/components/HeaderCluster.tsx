'use client';

import Image from 'next/image';
import { useTheme } from '@/components/ThemeProvider';
import { LIGHT_THEMES } from '@/lib/theme';

const DISPLAY = 'var(--font-hn-black), "Helvetica Neue", Arial, sans-serif';

/** Recolors black line-art (via alpha mask) to the current theme's ink color, instead of a flat invert. */
function maskedArt(src: string): React.CSSProperties {
  return {
    backgroundColor: 'var(--vlg-fg, #000000)',
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  };
}

// Flipped word-marks — exact Figma coords. transform flips match Figma's
// "flipped horizontally / vertically" flags.
type Word = {
  text: string;
  x: number;
  y: number;
  flipX?: boolean;
  flipY?: boolean;
  rotate?: number;     // degrees, clockwise
  origin?: string;     // transform-origin
  w?: number;          // fixed box width — lets the word wrap like Figma
  lineHeight?: number;
};

const WORDS: Word[] = [
  { text: 'VILLAGE RADIO', x: 1129, y: 21, flipX: true },
  { text: 'VILLAGE', x: 1266, y: 37, flipX: true },
  { text: 'VILLAGE', x: 1258, y: 41, flipX: true },
  { text: 'VILLAGE', x: 1226, y: 25, flipX: true },
  // Vertical word-mark down the right edge — flipped horizontally and rotated so
  // the V reads at the BOTTOM, E at the top (reading upward).
  { text: 'VILLAGE', x: 1411, y: 160, rotate: 90, flipX: true, origin: 'top left' },
];

// Pre-rendered VILL + VGE sub-cluster (supplied as an asset). Placed so the "VG"
// sits with its V right under the "O" of RADIO. Combined Figma box: VILL X=1070
// Y=43 → VGE right edge ~1188; native PNG is 479×325 (aspect ~1.474).
const ANTI_VETICA = { x: 1052, y: 43, w: 118, h: 118 / (479 / 325) };

// IMG_2411 oval marks — exact Figma coords (x, y, w, h)
const OVALS: [number, number, number, number][] = [
  [1232, 56, 88, 88],
  [1234, 80, 85, 67],
  [1266, 76, 67, 67],
  [1294, 72, 67, 67],
  [1178, 68, 67, 67],
  [1206, 64, 67, 67],
  [1220, 60, 67, 67],
  [1280, 56, 67, 67],
  [1280, 56, 67, 67],
  [1192, 84, 67, 67],
];

export function HeaderCluster({ xOffset = 0 }: { xOffset?: number }) {
  // The anti-vetica PNG has a baked white ground. On light themes `multiply`
  // drops that white to transparent (black art survives); on dark themes it
  // would erase the art, so leave it normal there.
  const { name: theme } = useTheme();
  const light = LIGHT_THEMES.has(theme);
  return (
    <div aria-hidden="true">
      {/* Oval marks sit behind the word-marks — recolored to match the letters, not inverted */}
      {OVALS.map(([x, y, w, h], i) => (
        <div
          key={`oval-${i}`}
          style={{
            position: 'absolute',
            left: x + xOffset,
            top: y,
            width: w,
            height: h,
            zIndex: 1,
            pointerEvents: 'none',
            ...maskedArt('/images/IMG_2411.png'),
          }}
        />
      ))}

      {/* Pre-rendered VILL + VGE block — flipped horizontally. The PNG has a
          baked white ground; on light themes we drop it by multiplying the img
          against its own bg-colored wrapper (the parent frame's transform
          isolates the blend group, so multiplying against the page won't work).
          Dark themes render it as-is. */}
      <div style={{
        position: 'absolute',
        left: ANTI_VETICA.x + xOffset,
        top: ANTI_VETICA.y,
        width: ANTI_VETICA.w,
        height: ANTI_VETICA.h,
        zIndex: 2,
        pointerEvents: 'none',
        background: light ? 'var(--vlg-bg, #fff)' : 'transparent',
      }}>
        <Image
          src="/images/anti-vetica.png"
          alt=""
          width={Math.round(ANTI_VETICA.w)}
          height={Math.round(ANTI_VETICA.h)}
          style={{
            width: '100%',
            height: '100%',
            transform: 'scaleX(-1)',
            mixBlendMode: light ? 'multiply' : 'normal',
          }}
        />
      </div>

      {WORDS.map((wd, i) => (
        <div
          key={`word-${i}`}
          style={{
            position: 'absolute',
            left: wd.x + xOffset,
            top: wd.y,
            fontFamily: DISPLAY,
            fontSize: 36,
            lineHeight: wd.lineHeight ?? 1,
            letterSpacing: '-0.04em',
            width: wd.w,
            whiteSpace: wd.w ? 'normal' : 'nowrap',
            color: 'var(--vlg-fg, #000000)',
            zIndex: 2,
            transform: `${wd.rotate ? `rotate(${wd.rotate}deg) ` : ''}scale(${wd.flipX ? -1 : 1}, ${wd.flipY ? -1 : 1})`,
            transformOrigin: wd.origin ?? 'center center',
          }}
        >
          {wd.text}
        </div>
      ))}
    </div>
  );
}
