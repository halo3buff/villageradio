import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Listen' };

export default function ListenPage() {
  return (
    <div className="px-5 pt-8 page-enter">
      <div className="pb-4 border-b border-black/[0.08] mb-8">
        <h1 className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-black/50">
          Signal
        </h1>
      </div>
      <div className="space-y-6 max-w-sm">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-vr-signal tracking-widest">● TRANSMITTING</span>
        </div>
        <p className="font-mono text-[10px] text-black/45 tracking-widest uppercase leading-relaxed">
          24 / 7<br />
          village radio<br />
          frequency unknown
        </p>
        <div className="pt-4">
          <div className="w-full h-px bg-black/[0.08]" />
          <div className="flex justify-between pt-3">
            {['—', '—', '—', '—', '—', '—', '—', '—'].map((_, i) => (
              <div
                key={i}
                className="w-px bg-black/20"
                style={{ height: `${8 + Math.sin(i * 1.3) * 6}px` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
