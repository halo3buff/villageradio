import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = { title: 'Photography' };

const negatives = [
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
];

export default function PhotographyPage() {
  return (
    <div className="page-enter">
      <div className="px-5 pt-8 pb-4 border-b border-white/[0.08]">
        <h1 className="font-mono text-[0.65rem] tracking-[0.15em] uppercase" style={{ color: 'rgba(200,196,187,0.45)' }}>
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
