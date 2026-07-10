import { NextResponse } from 'next/server';
import type { CommandsManifest } from '@/lib/types';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { readManifest, writeManifest, ConflictError } from '@/lib/content/store';
import { publishManifest } from '@/lib/content/loaders';
import { SEED_COMMANDS } from '@/lib/content/seed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILE = 'commands.json';

export async function GET(): Promise<Response> {
  await requireAdmin();
  const res = await readManifest<CommandsManifest>(FILE);
  if (!res) return NextResponse.json({ manifest: SEED_COMMANDS, generation: '0' });
  return NextResponse.json({ manifest: res.data, generation: res.generation });
}

export async function PUT(req: Request): Promise<Response> {
  await requireAdmin();
  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });
  }

  let body: { manifest?: unknown; generation?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  if (typeof body.generation !== 'string' || body.generation.length === 0) {
    return NextResponse.json({ ok: false, error: 'missing_generation' }, { status: 400 });
  }

  const m = body.manifest as Partial<CommandsManifest> | null;
  if (!m || m.version !== 1 || !Array.isArray(m.commands)) {
    return NextResponse.json({ ok: false, error: 'invalid_manifest' }, { status: 400 });
  }
  for (const c of m.commands) {
    if (typeof c.cmd !== 'string' || !c.cmd || typeof c.route !== 'string' || !c.route || typeof c.label !== 'string') {
      return NextResponse.json({ ok: false, error: 'invalid_command_entry' }, { status: 400 });
    }
  }

  try {
    await writeManifest(FILE, body.manifest, { ifGenerationMatch: body.generation });
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ ok: false, error: 'conflict' }, { status: 409 });
    }
    console.error('[admin/commands] write failed', err);
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 });
  }

  await publishManifest('commands');

  const after = await readManifest<CommandsManifest>(FILE);
  return NextResponse.json({ ok: true, generation: after?.generation ?? body.generation });
}
