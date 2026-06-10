import type { BroadcastManifest } from '@/lib/types';
import { requireAdmin } from '@/lib/auth/guard';
import { readManifest } from '@/lib/content/store';
import { SEED_BROADCAST } from '@/lib/content/seed';
import { ArrangementList } from '@/components/admin/ArrangementList';

// Read the LIVE manifest (real generation), never the 300s-cached public loader.
export const dynamic = 'force-dynamic';

export default async function AdminBroadcast() {
  await requireAdmin();
  // Falls back to the bundled seed (generation '0' = "create if absent") until first publish.
  const res = await readManifest<BroadcastManifest>('broadcast.json');
  const manifest = res?.data ?? SEED_BROADCAST;
  const generation = res?.generation ?? '0';

  return <ArrangementList initialEntries={manifest.entries} generation={generation} />;
}
