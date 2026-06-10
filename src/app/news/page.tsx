import type { Metadata } from 'next';
import { getNews } from '@/lib/content/loaders';
import { EditorialBody } from '@/components/EditorialBody';

export const metadata: Metadata = { title: 'News' };

export default async function NewsPage() {
  const posts = (await getNews()).filter(post => post.status === 'published');
  return (
    <div className="page-enter">
      <div className="px-5 pt-8 pb-4 border-b border-white/[0.08]">
        <h1 className="font-mono text-[0.65rem] tracking-[0.15em] uppercase" style={{ color: 'rgba(200,196,187,0.45)' }}>
          News
        </h1>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {posts.map(post => (
          <article key={post.id} className="px-5 py-10 max-w-2xl">
            <h1 className="font-mono text-xs tracking-widest uppercase mb-1" style={{ color: '#e8e4d9' }}>
              {post.title}
            </h1>
            <h1 className="font-mono text-xs tracking-widest uppercase mb-8" style={{ color: 'rgba(200,196,187,0.4)' }}>
              {post.date}
            </h1>
            <EditorialBody markdown={post.body} />
          </article>
        ))}
      </div>
    </div>
  );
}
