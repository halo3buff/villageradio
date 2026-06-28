import type { Metadata } from 'next';
import { NewsShell } from '@/components/NewsShell';

export const metadata: Metadata = { title: 'News' };

export default function NewsPage() {
  return <NewsShell />;
}
