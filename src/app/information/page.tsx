import type { Metadata } from 'next';
import { getInformation } from '@/lib/content/loaders';
import { InfoShell } from '@/components/InfoShell';

export const metadata: Metadata = { title: 'Information' };

export default async function InformationPage() {
  const raw = await getInformation();

  return <InfoShell content={raw} />;
}
