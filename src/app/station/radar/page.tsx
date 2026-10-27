import type { Metadata } from 'next';
import { Gate } from '@/components/Gate';
import { RadarDesktop } from '@/components/RadarDesktop';
import { getLive } from '@/lib/live';

export const metadata: Metadata = { title: 'Radar' };
// rendered per request; after that the console polls /api/radar/live itself
export const dynamic = 'force-dynamic';

/** The radar console — reached from the station, sharing its pass (see gateOf). */
export default async function StationRadarPage() {
  return <Gate path="/station"><RadarDesktop initial={await getLive()} /></Gate>;
}
