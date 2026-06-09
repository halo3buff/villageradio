import type { WorkManifest } from '@/lib/types';
import { requireAdmin } from '@/lib/auth/guard';
import { readManifest } from '@/lib/content/store';
import { SEED_WORK } from '@/lib/content/seed';
import { WorkManager } from '@/components/admin/WorkManager';

// Read the LIVE manifest (real generation), never the 300s-cached public loader.
export const dynamic = 'force-dynamic';

export default async function AdminWork() {
  await requireAdmin();
  // Falls back to the bundled seed (generation '0' = "create if absent") until first publish.
  const res = await readManifest<WorkManifest>('work.json');
  const projects = res?.data.projects ?? SEED_WORK.projects;
  const generation = res?.generation ?? '0';

  return <WorkManager initialProjects={projects} generation={generation} />;
}
