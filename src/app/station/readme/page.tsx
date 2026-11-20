import type { Metadata } from 'next';
import { getInformation } from '@/lib/content/loaders';
import { Gate } from '@/components/Gate';
import { InfoShell } from '@/components/InfoShell';

export const metadata: Metadata = { title: 'Information' };

/** README_1 — the full manual, reached from the station. Shares the station's pass
 *  (see gateOf), so hopping between the two never re-locks. */
export default async function StationReadmePage() {
  const content = await getInformation();
  return <Gate path="/station"><InfoShell content={content} commands={[]} back="/station" /></Gate>;
}
