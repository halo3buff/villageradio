import type { Metadata } from 'next';
import { NewsShell } from '@/components/NewsShell';
import { Gate } from '@/components/Gate';

export const metadata: Metadata = { title: 'News' };

export default function NewsPage() {
  return <Gate path="/news"><NewsShell /></Gate>;
}
