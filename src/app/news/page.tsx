import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'News' };

const posts = [
  {
    title: 'Transmission Notes — Vol. I',
    date: '2026-04-06',
    body: 'The signal is always there. Sometimes it is buried under noise. Sometimes the noise is the signal. We are still figuring out which.',
  },
  {
    title: 'On the Archive',
    date: '2026-02-14',
    body: 'An archive is not a record of what happened. It is a record of what survived.',
  },
];

export default function NewsPage() {
  return (
    <div className="page-enter">
      <div className="px-5 pt-8 pb-4 border-b border-black/[0.08]">
        <h1 className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-black/50">
          News
        </h1>
      </div>
      <div className="divide-y divide-black/[0.08]">
        {posts.map(post => (
          <article key={post.title} className="px-5 py-10 max-w-2xl">
            <h1 className="font-mono text-xs tracking-widest uppercase text-vr-white mb-1">
              {post.title}
            </h1>
            <h1 className="font-mono text-xs tracking-widest uppercase text-black/50 mb-8">
              {post.date}
            </h1>
            <p className="text-sm text-black/80 leading-relaxed max-w-[60ch]">
              {post.body}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
