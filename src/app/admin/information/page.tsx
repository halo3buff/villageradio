import type { CommandsManifest } from '@/lib/types';
import { requireAdmin } from '@/lib/auth/guard';
import { readManifest } from '@/lib/content/store';
import { SEED_COMMANDS } from '@/lib/content/seed';
import { CommandsEditor } from '@/components/admin/CommandsEditor';

export const dynamic = 'force-dynamic';

export default async function AdminInformation() {
  await requireAdmin();
  const res = await readManifest<CommandsManifest>('commands.json');
  const commands = res?.data.commands ?? SEED_COMMANDS.commands;
  const generation = res?.generation ?? '0';

  return <CommandsEditor initialCommands={commands} generation={generation} />;
}
