import type { Metadata } from 'next';
import { mixes } from '@/lib/data/mixes';
import { MixList } from '@/components/MixList';

export const metadata: Metadata = { title: 'Mixes' };

export default function MixesPage() {
  return (
    <div className="page-enter">
      <div className="px-5 pt-8 pb-4 border-b border-black/[0.08]">
        <h1 className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-black/50">
          Archive
        </h1>
      </div>
      <MixList mixes={mixes} />
    </div>
  );
}
