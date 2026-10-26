import type { Metadata } from 'next';
import { Gate } from '@/components/Gate';
import { RadarDesktop } from '@/components/RadarDesktop';
import { getRadarFeed } from '@/lib/radar';

export const metadata: Metadata = { title: 'Radar' };
export const revalidate = 3600;

/** The radar — reached from the station, sharing its pass (see gateOf). */
export default async function StationRadarPage() {
  return <Gate path="/station"><RadarDesktop feed={await getRadarFeed()} /></Gate>;
}
