import type { Metadata } from 'next';
import { Gate } from '@/components/Gate';
import { RecFrame } from '@/components/RecFrame';

export const metadata: Metadata = { title: 'Rec' };

/** The recording view — reached only by typing its passphrase at the command prompt. */
export default function RecPage() {
  return <Gate path="/rec"><RecFrame /></Gate>;
}
