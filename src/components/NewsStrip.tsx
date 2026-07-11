import fs from 'fs';
import path from 'path';

export function NewsStrip() {
  const filePath = path.join(process.cwd(), 'public', 'information', 'news_strip.json');
  const items: string[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const doubled = [...items, ...items];

  return (
    <div
      className="fixed inset-x-0 z-40 overflow-hidden"
      style={{ bottom: '41px', background: 'var(--vlg-bg, #080808)', borderTop: '1px solid var(--vlg-border, rgba(255,255,255,0.08))' }}
    >
      <div className="ticker flex py-[9px]">
        {doubled.map((item, i) => (
          <span
            key={i}
            className="font-mono text-[0.6rem] tracking-[0.15em] uppercase shrink-0"
            style={{ color: 'var(--vlg-fg-dim, rgba(200,196,187,0.5))', paddingRight: '4rem' }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
