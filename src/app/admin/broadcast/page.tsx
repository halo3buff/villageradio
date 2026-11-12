import type { BroadcastManifest } from '@/lib/types';
import { requireAdmin } from '@/lib/auth/guard';
import { readManifest } from '@/lib/content/store';
import { SEED_BROADCAST } from '@/lib/content/seed';
import { ArrangementList } from '@/components/admin/ArrangementList';
import { LogEditor } from '@/components/admin/LogEditor';
import { logLines, SEED_LOG, type LogManifest } from '@/lib/content/log';

// Read the LIVE manifest (real generation), never the 300s-cached public loader.
export const dynamic = 'force-dynamic';

export default async function AdminBroadcast() {
  await requireAdmin();
  // Falls back to the bundled seed (generation '0' = "create if absent") until first publish.
  const [res, logRes] = await Promise.all([readManifest<BroadcastManifest>('broadcast.json'), readManifest<LogManifest>('log.json')]);
  const manifest = res?.data ?? SEED_BROADCAST;
  const generation = res?.generation ?? '0';

  // the log's remarks: today and the two days before (older remarks are kept, just not shown here)
  const log = logRes?.data ?? SEED_LOG;
  const days = logLines(manifest, log, Date.now()).slice(0, 3).map((l) => ({ n: Number(l.tx), tx: l.tx, date: l.date }));

  return (
    <ArrangementList
      initial={manifest}
      generation={generation}
      aside={<LogEditor rows={days} initialRemarks={log.remarks} generation={logRes?.generation ?? '0'} />}
    />
  );
}
