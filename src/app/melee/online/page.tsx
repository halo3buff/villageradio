import type { Metadata } from 'next';
import { MeleeOnline } from '@/components/MeleeOnline';

export const metadata: Metadata = { title: 'Melee online', robots: { index: false } };

/** Online Melee, the host's side: reached from the `melee` window's ONLINE link.
 *  Cross-origin isolated by next.config headers, which the framed local engine needs. */
export default function MeleeOnlinePage() {
  return <MeleeOnline />;
}
