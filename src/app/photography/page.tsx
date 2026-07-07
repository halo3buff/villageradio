import type { Metadata } from 'next';
import { PhotographyShell } from '@/components/PhotographyShell';
import { Gate } from '@/components/Gate';

export const metadata: Metadata = { title: 'Photography' };

export default function PhotographyPage() {
  return <Gate path="/photography"><PhotographyShell /></Gate>;
}
