import type { NewsPost } from '@/lib/types';
import { NewsLogViewer } from '@/components/NewsLogViewer';

export function NewsShell({ posts }: { posts: NewsPost[] }) {
  return <NewsLogViewer posts={posts} />;
}
