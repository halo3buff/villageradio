import { requireAdmin } from '@/lib/auth/guard';
import { readManifest } from '@/lib/content/store';
import { Mixer } from '@/components/admin/Mixer';
import type { BoardManifest } from '@/app/api/admin/board/route';

export const dynamic = 'force-dynamic';

export default async function AdminMixer() {
  await requireAdmin();
  const res = await readManifest<BoardManifest>('board.json');
  return <Mixer initialBoard={res?.data.sounds ?? []} />;
}
