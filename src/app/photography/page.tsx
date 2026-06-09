import type { Metadata } from 'next';
import Image from 'next/image';
import { getPhotos } from '@/lib/content/loaders';

export const metadata: Metadata = { title: 'Photography' };

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

export default async function PhotographyPage() {
  const files = (await getPhotos()).map(p => p.key);

  // Scatter photos with no structural pattern — same seed + order ⇒ identical layout.
  const shuffledIndices = shuffle(TOTAL, 0x1a2b3c4d);
  const grid: (string | null)[] = Array(TOTAL).fill(null);
  shuffledIndices.slice(0, files.length).forEach((cellIdx, photoIdx) => {
    grid[cellIdx] = files[photoIdx];
  });

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
