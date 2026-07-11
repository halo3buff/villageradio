import type { Metadata } from 'next';
import { getNews } from '@/lib/content/loaders';
import { NewsShell } from '@/components/NewsShell';
import { Gate } from '@/components/Gate';

export const metadata: Metadata = { title: 'News' };

export default async function NewsPage() {
  const allPosts = await getNews();
  const posts = allPosts.filter(p => p.status === 'published');
  return <Gate path="/news"><NewsShell posts={posts} /></Gate>;
}
