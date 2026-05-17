import fs from 'fs';
import path from 'path';

export function NewsStrip() {
  const filePath = path.join(process.cwd(), 'public', 'information', 'news_strip.json');
  const items: string[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const doubled = [...items, ...items];

  return (
    <div className="fixed inset-x-0 z-40 bg-[#f0efe9] border-t border-black/[0.08] overflow-hidden"
         style={{ bottom: '41px' }}>
      <div className="ticker flex py-[9px]">
        {doubled.map((item, i) => (
          <span
            key={i}
            className="font-mono text-[0.6rem] tracking-[0.15em] text-black/50 uppercase shrink-0"
            style={{ paddingRight: '4rem' }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
