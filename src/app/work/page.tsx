import type { Metadata } from 'next';
import { WorkShell } from '@/components/WorkShell';

export const metadata: Metadata = { title: 'Work' };

export default function WorkPage() {
  return <WorkShell />;
}
