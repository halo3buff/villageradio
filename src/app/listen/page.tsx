import type { Metadata } from 'next';
import { ListenShell } from '@/components/ListenShell';

export const metadata: Metadata = { title: 'Listen' };

export default function ListenPage() {
  return <ListenShell />;
}
