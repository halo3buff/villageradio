import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Work' };

export default function WorkPage() {
  return (
    <div className="page-enter">
      <div className="px-5 pt-8 pb-4 border-b border-white/[0.06]">
        <h1 className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-white/30">
          Work
        </h1>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 border-l border-t border-white/[0.08]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="border-r border-b border-white/[0.08] aspect-square bg-white/[0.02]"
          />
        ))}
      </div>
    </div>
  );
}
