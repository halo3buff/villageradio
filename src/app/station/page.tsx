import type { Metadata } from 'next';
import { Gate } from '@/components/Gate';
import { HomeDesktop } from '@/components/HomeDesktop';

export const metadata: Metadata = { title: 'Station' };

/**
 * The station itself — reached only by typing the passphrase at the command
 * prompt, which grants the clearance this Gate checks.
 */
export default function StationPage() {
  return <Gate path="/station"><HomeDesktop /></Gate>;
}
