import type { Metadata } from 'next';
import { Gate } from '@/components/Gate';
import { RadarDesktop } from '@/components/RadarDesktop';
import { fireLines, getFires } from '@/lib/fires';
import { getGazaReports, getNet, getOutages, getRadarFeed, telexLines } from '@/lib/radar';

export const metadata: Metadata = { title: 'Radar' };
// rendered per request (the console refreshes it every minute); the feeds themselves are
// cached for 2–5 minutes in their fetches. ISR here kept serving the build-time copy.
export const dynamic = 'force-dynamic';

/** The radar console — reached from the station, sharing its pass (see gateOf). */
export default async function StationRadarPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [feed, gaza, outages, net, fires] = await Promise.all([getRadarFeed(), getGazaReports(today), getOutages(), getNet(), getFires()]);
  const telex = telexLines(feed?.contacts ?? [], gaza, outages, [...net.lines, ...fireLines(fires ?? [])]);
  return <Gate path="/station"><RadarDesktop feed={feed} telex={telex} net={net.now} fires={fires} /></Gate>;
}
