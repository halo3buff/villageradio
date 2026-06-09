import { NextResponse } from 'next/server';
import type { BroadcastManifest } from '@/lib/types';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { validateManifest } from '@/lib/content/arrange';
import { readManifest, writeManifest, ConflictError } from '@/lib/content/store';
import { publishManifest } from '@/lib/content/loaders';
import { SEED_BROADCAST } from '@/lib/content/seed';

export const runtime = 'nodejs';
// Admin must read the LIVE manifest (its real generation), never the 300s-cached loader.
export const dynamic = 'force-dynamic';

const FILE = 'broadcast.json';

/** Live read for the editor: returns the manifest + the generation to echo back on publish. */
export async function GET(): Promise<Response> {
  await requireAdmin();
  const res = await readManifest<BroadcastManifest>(FILE);
  if (!res) {
    // Not seeded yet — serve the bundled seed; generation "0" means "create if absent".
    return NextResponse.json({ manifest: SEED_BROADCAST, generation: '0' });
  }
  return NextResponse.json({ manifest: res.data, generation: res.generation });
}

/** Staged publish: optimistic write of the whole manifest, then bust the public cache tag. */
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

  const check = validateManifest(body.manifest);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: 'invalid_manifest', details: check.errors }, { status: 400 });
  }

  try {
    await writeManifest(FILE, body.manifest, { ifGenerationMatch: body.generation });
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json(
        { ok: false, error: 'conflict', message: 'the live lineup changed — reload and retry' },
        { status: 409 },
      );
    }
    console.error('[admin/broadcast] write failed', err);
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 });
  }

  await publishManifest('broadcast');

  // Re-read so the editor can adopt the fresh generation and publish again without a 409.
  const after = await readManifest<BroadcastManifest>(FILE);
  return NextResponse.json({ ok: true, generation: after?.generation ?? body.generation });
}
