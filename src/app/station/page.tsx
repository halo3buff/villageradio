import type { Metadata } from 'next';
import { Gate } from '@/components/Gate';
import { HomeDesktop } from '@/components/HomeDesktop';
import { getLog } from '@/lib/content/loaders';

export const metadata: Metadata = { title: 'Station' };
export const revalidate = 300;   // the log's remarks (a publish also busts them at once)

/**
 * The station itself — reached only by typing the passphrase at the command
 * prompt, which grants the clearance this Gate checks.
 */
export default async function StationPage() {
  return <Gate path="/station"><HomeDesktop remarks={(await getLog()).remarks} /></Gate>;
}
