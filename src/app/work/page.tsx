import type { Metadata } from 'next';
import { WorkShell } from '@/components/WorkShell';
import { Gate } from '@/components/Gate';

export const metadata: Metadata = { title: 'Work' };

export default function WorkPage() {
  return <Gate path="/work"><WorkShell /></Gate>;
}
