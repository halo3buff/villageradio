import type { Metadata } from 'next';
import { MeleeJoin } from '@/components/MeleeJoin';

export const metadata: Metadata = { title: 'Melee', robots: { index: false } };

/** A friend's invite link lands here: the host's game, live, with this browser as player 2. */
export default function MeleeJoinPage() {
  return <MeleeJoin />;
}
