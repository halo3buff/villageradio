import type { SiteManifest } from '@/lib/types';
import { requireAdmin } from '@/lib/auth/guard';
import { readManifest } from '@/lib/content/store';
import { SiteSettingsEditor } from '@/components/admin/SiteSettingsEditor';

export const dynamic = 'force-dynamic';

export default async function AdminSettings() {
  await requireAdmin();
  const res = await readManifest<SiteManifest>('site.json');
  const theme = res?.data.theme ?? 'default';
  const generation = res?.generation ?? '0';

  return <SiteSettingsEditor initialTheme={theme} generation={generation} />;
}
