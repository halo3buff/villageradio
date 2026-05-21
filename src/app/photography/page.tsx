import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = { title: 'Photography' };

const negatives = [
  'imageedit_1_4032830485.jpg',
  'imageedit_2_5295219581.jpg',
  'imageedit_3_3561245105.jpg',
  'imageedit_4_4137559447.jpg',
  'imageedit_5_7454865225.jpg',
  'imageedit_6_6647747721.jpg',
  'imageedit_7_6783885179.jpg',
  'imageedit_8_2444709663.jpg',
  'imageedit_9_7007049846.jpg',
  'imageedit_10_8619967754.jpg',
  'imageedit_11_4593521330.jpg',
  'imageedit_12_5012049933.jpg',
  'imageedit_13_7605778872.jpg',
  'imageedit_14_5085874280.jpg',
  'imageedit_15_2778604151.jpg',
  'imageedit_16_6231462993.jpg',
  'imageedit_17_3089377819.jpg',
  'imageedit_18_9041475796.jpg',
  'imageedit_19_8620109001.jpg',
  'imageedit_21_3890543109.jpg',
  'imageedit_22_4647095204.jpg',
  'imageedit_23_4484190545.jpg',
  'imageedit_24_8567923604.jpg',
  'imageedit_25_4704078271.jpg',
  'imageedit_26_9444399844.jpg',
  'imageedit_27_2082830774.jpg',
  'imageedit_28_7143446878.jpg',
  'imageedit_29_7091491116.jpg',
  'imageedit_30_5934327159.jpg',
  'imageedit_31_4361083790.jpg',
  'imageedit_32_5986057362.jpg',
  'imageedit_33_3970191891.jpg',
  'imageedit_34_3862085734.jpg',
  'imageedit_35_8331456541.jpg',
  'imageedit_36_5983645060.jpg',
  'imageedit_37_3345397114.jpg',
  'imageedit_38_7342034733.jpg',
  'imageedit_39_2478579523.jpg',
  'imageedit_40_6800592125.jpg',
  'imageedit_41_7885009128.jpg',
  'imageedit_42_4314756183.jpg',
];

// mulberry32 — high-quality 32-bit PRNG, deterministic from a fixed seed.
// Running at module level means identical output on server and client (no hydration mismatch).
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// Fisher-Yates shuffle using the PRNG — no modulo bias, no visible structure.
function shuffle(length: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

const COLS = 9;
// 7 rows × 9 cols = 63 cells total; 41 filled, 22 empty (~35% gaps)
const ROWS = 7;
const TOTAL = COLS * ROWS;

// Shuffle all cell indices, assign photos to the first N, leave the rest empty.
// This scatters photos with no structural pattern whatsoever.
const shuffledIndices = shuffle(TOTAL, 0x1a2b3c4d);
const grid: (string | null)[] = Array(TOTAL).fill(null);
shuffledIndices.slice(0, negatives.length).forEach((cellIdx, photoIdx) => {
  grid[cellIdx] = negatives[photoIdx];
});

export default function PhotographyPage() {
  return (
    <div className="page-enter">
      <div className="px-5 pt-8 pb-4 border-b border-white/[0.08]">
        <h1
          className="font-mono text-[0.65rem] tracking-[0.15em] uppercase"
          style={{ color: 'rgba(200,196,187,0.45)' }}
        >
          Photography — Negative Series
        </h1>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gap: '6px',
          padding: '24px 56px',
        }}
      >
        {grid.map((file, i) =>
          file ? (
            <div key={i} className="relative aspect-square overflow-hidden">
              <Image
                src={`/images/photography/negative/${file}`}
                alt=""
                fill
                className="object-cover"
                sizes="11vw"
              />
            </div>
          ) : (
            <div key={i} className="aspect-square" />
          )
        )}
      </div>
    </div>
  );
}
