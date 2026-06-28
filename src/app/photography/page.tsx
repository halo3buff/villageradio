import type { Metadata } from 'next';
import { PhotographyShell } from '@/components/PhotographyShell';

export const metadata: Metadata = { title: 'Photography' };

export default function PhotographyPage() {
  return <PhotographyShell />;
}
