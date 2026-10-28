import type { Metadata, Viewport } from 'next';
import { Gate } from '@/components/Gate';
import { RadarDesktop } from '@/components/RadarDesktop';
import { getLive } from '@/lib/live';

export const metadata: Metadata = { title: 'Radar' };
// the plates' fine print is small on a phone: here, unlike the rest of the site, pinch to read it
export const viewport: Viewport = { maximumScale: 5, userScalable: true };
// rendered per request; after that the console polls /api/radar/live itself
export const dynamic = 'force-dynamic';

/** The radar console — reached from the station, sharing its pass (see gateOf). */
export default async function StationRadarPage() {
  return <Gate path="/station"><RadarDesktop initial={await getLive()} /></Gate>;
}
