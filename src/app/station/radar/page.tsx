import type { Metadata } from 'next';
import { Gate } from '@/components/Gate';
import { RadarDesktop } from '@/components/RadarDesktop';
import { getGazaReports, getNet, getOutages, getRadarFeed, telexLines } from '@/lib/radar';

export const metadata: Metadata = { title: 'Radar' };
export const revalidate = 60;

/** The radar console — reached from the station, sharing its pass (see gateOf). */
export default async function StationRadarPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [feed, gaza, outages, net] = await Promise.all([getRadarFeed(), getGazaReports(today), getOutages(), getNet()]);
  const telex = telexLines(feed?.contacts ?? [], gaza, outages, net.lines);
  return <Gate path="/station"><RadarDesktop feed={feed} telex={telex} net={net.now} /></Gate>;
}
