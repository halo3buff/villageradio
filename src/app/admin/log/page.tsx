import { requireAdmin } from '@/lib/auth/guard';
import { readManifest } from '@/lib/content/store';
import { SEED_BROADCAST } from '@/lib/content/seed';
import { logLines, SEED_LOG, type LogManifest } from '@/lib/content/log';
import { LogEditor } from '@/components/admin/LogEditor';

export const dynamic = 'force-dynamic';

const RECENT = 7;   // today and the six days before; older days show only once they hold a remark

export default async function AdminLog() {
  await requireAdmin();
  const res = await readManifest<LogManifest>('log.json');
  const log = res?.data ?? SEED_LOG;
  const rows = logLines(SEED_BROADCAST, log, Date.now())
    .filter((l, i) => i < RECENT || l.remark)
    .map((l) => ({ n: Number(l.tx), tx: l.tx, date: l.date }));

  return <LogEditor rows={rows} initialRemarks={log.remarks} generation={res?.generation ?? '0'} />;
}
