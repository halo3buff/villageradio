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
  'imageedit_9_7007049864.jpg',
  'imageedit_10_8619967754.jpg',
  'imageedit_11_4593521330.jpg',
  'imageedit_12_5012049933.jpg',
];

export default function PhotographyPage() {
  return (
    <div className="page-enter">
      <div className="px-5 pt-8 pb-4 border-b border-black/[0.08]">
        <h1 className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-black/50">
          Photography — Negative Series
        </h1>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
        {negatives.map((file, i) => (
          <div key={i} className="relative aspect-square">
            <Image
              src={`/images/photography/negative/${file}`}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 17vw"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
