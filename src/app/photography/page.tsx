import type { Metadata } from 'next';
import { PhotographyShell } from '@/components/PhotographyShell';
import { Gate } from '@/components/Gate';
import { getPhotos } from '@/lib/content/loaders';

export const metadata: Metadata = { title: 'Photography' };

export default async function PhotographyPage() {
  const photos = await getPhotos();
  return <Gate path="/photography"><PhotographyShell photos={photos} /></Gate>;
}
