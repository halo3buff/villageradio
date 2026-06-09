import type { NewsManifest } from '@/lib/types';
import { requireAdmin } from '@/lib/auth/guard';
import { readManifest } from '@/lib/content/store';
import { SEED_NEWS } from '@/lib/content/seed';
import { NewsManager } from '@/components/admin/NewsManager';

// Read the LIVE manifest (real generation), never the 300s-cached public loader.
export const dynamic = 'force-dynamic';

export default async function AdminNews() {
  await requireAdmin();
  // Falls back to the bundled seed (generation '0' = "create if absent") until first publish.
  const res = await readManifest<NewsManifest>('news.json');
  const posts = res?.data.posts ?? SEED_NEWS.posts;
  const generation = res?.generation ?? '0';

  return <NewsManager initialPosts={posts} generation={generation} />;
}
