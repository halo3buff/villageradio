import type { Metadata } from 'next';
import { FarmWatch } from '@/components/FarmWatch';
import { getFires } from '@/lib/fires';

export const metadata: Metadata = { title: 'Harvest Watch', description: 'Weather, nearby fires and help for farmers in Palestine.' };
export const dynamic = 'force-dynamic';

/** Harvest Watch — open to anyone (no checkpoint), reached by typing `farm` at the prompt. */
export default async function FarmPage() {
  const fires = (await getFires()) ?? [];
  return <FarmWatch fires={fires.filter(f => f.region).map(({ lat, lon, t, frp }) => ({ lat, lon, t, frp }))} />;
}
