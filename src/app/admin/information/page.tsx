import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requireAdmin } from '@/lib/auth/guard';
import { readText } from '@/lib/content/store';
import { InformationEditor } from '@/components/admin/InformationEditor';

// Read the LIVE document (real generation), never the 300s-cached public loader.
export const dynamic = 'force-dynamic';

export default async function AdminInformation() {
  await requireAdmin();
  // Falls back to the bundled doc (generation '0' = "create if absent") until first publish.
  const res = await readText('information.md');
  const text = res?.text ?? readFileSync(join(process.cwd(), 'public', 'information', 'info_page.md'), 'utf-8');
  const generation = res?.generation ?? '0';

  return <InformationEditor initialText={text} generation={generation} />;
}
