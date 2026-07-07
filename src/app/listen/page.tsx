import type { Metadata } from 'next';
import { ListenShell } from '@/components/ListenShell';
import { Gate } from '@/components/Gate';

export const metadata: Metadata = { title: 'Listen' };

export default function ListenPage() {
  return <Gate path="/listen"><ListenShell /></Gate>;
}
