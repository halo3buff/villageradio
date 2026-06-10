import type { Metadata } from 'next';
import { getInformation } from '@/lib/content/loaders';
import { EditorialBody } from '@/components/EditorialBody';

export const metadata: Metadata = { title: 'Information' };

export default async function InformationPage() {
  const raw = await getInformation();

  return (
    <div className="px-5 pt-10 pb-8 page-enter max-w-2xl">
      <EditorialBody markdown={raw} />
    </div>
  );
}
