import type { Metadata } from 'next';
import { getInformation } from '@/lib/content/loaders';

export const metadata: Metadata = { title: 'Information' };

export default async function InformationPage() {
  const raw = await getInformation();

  const blocks = raw.split(/\n\n+/).filter(s => s.trim());

  return (
    <div className="px-5 pt-10 pb-8 page-enter max-w-2xl">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={i} className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-vr-white mb-8">
              {trimmed.slice(2)}
            </h1>
          );
        }
        if (trimmed === '---') {
          return <hr key={i} className="border-none border-t border-white/[0.08] my-8" />;
        }
        return (
          <p key={i} className="text-sm leading-relaxed mb-6 max-w-[60ch]" style={{ color: 'rgba(200,196,187,0.75)' }}>
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
