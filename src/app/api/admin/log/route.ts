import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { readManifest, writeManifest, ConflictError } from '@/lib/content/store';
import { publishManifest } from '@/lib/content/loaders';
import { ENTRY_MAX, ENTRIES_KEPT, type LogEntry, type LogManifest } from '@/lib/content/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILE = 'log.json';

/** The operator's entries, written whole: optimistic write, then bust the public cache tag. */
export async function PUT(req: Request): Promise<Response> {
  await requireAdmin();
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });

  let body: { entries?: unknown; generation?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  if (typeof body.generation !== 'string' || !body.generation) {
    return NextResponse.json({ ok: false, error: 'missing_generation' }, { status: 400 });
  }
  if (!Array.isArray(body.entries)) return NextResponse.json({ ok: false, error: 'invalid_entries' }, { status: 400 });
  const entries: LogEntry[] = [];
  for (const e of body.entries as { at?: unknown; text?: unknown }[]) {
    if (!e || !Number.isFinite(e.at) || typeof e.text !== 'string' || !e.text.trim() || e.text.trim().length > ENTRY_MAX) {
      return NextResponse.json({ ok: false, error: 'invalid_entry' }, { status: 400 });
    }
    entries.push({ at: Number(e.at), text: e.text.trim() });
  }
  entries.sort((a, b) => a.at - b.at);

  try {
    await writeManifest<LogManifest>(FILE, { version: 1, entries: entries.slice(-ENTRIES_KEPT) }, { ifGenerationMatch: body.generation });
  } catch (err) {
    if (err instanceof ConflictError) return NextResponse.json({ ok: false, error: 'conflict' }, { status: 409 });
    console.error('[admin/log] write failed', err);
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 });
  }
  await publishManifest('log');

  const after = await readManifest<LogManifest>(FILE);
  return NextResponse.json({ ok: true, generation: after?.generation ?? body.generation });
}
