import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Work' };

export default function WorkPage() {
  return (
    <div className="page-enter">
      <div className="px-5 pt-8 pb-4 border-b border-black/[0.08]">
        <h1 className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-black/50">
          Work
        </h1>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 border-l border-t border-black/[0.10]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="border-r border-b border-black/[0.10] aspect-square bg-black/[0.02]"
          />
        ))}
      </div>
    </div>
  );
}
