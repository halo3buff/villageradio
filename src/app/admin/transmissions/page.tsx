import type { TransmissionItem } from '@/lib/types';
import { requireAdmin } from '@/lib/auth/guard';
import { listQueue } from '@/lib/transmissions/store';
import { ModerationQueue } from '@/components/admin/ModerationQueue';

// Read the LIVE queue from GCS on every load — there is no manifest or cache here.
export const dynamic = 'force-dynamic';

export default async function AdminTransmissions() {
  await requireAdmin();

  let items: TransmissionItem[] = [];
  let loadError = '';
  try {
    items = await listQueue();
  } catch (err) {
    console.error('[admin/transmissions] list failed', err);
    loadError = 'could not load the queue — check TRANSMISSIONS_BUCKET and the service-account grant.';
  }

  return <ModerationQueue initialItems={items} loadError={loadError} />;
}
