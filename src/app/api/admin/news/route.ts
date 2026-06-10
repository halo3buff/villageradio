import { NextResponse } from 'next/server';
import type { NewsManifest } from '@/lib/types';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { validateNewsManifest } from '@/lib/content/news';
import { readManifest, writeManifest, ConflictError } from '@/lib/content/store';
import { publishManifest } from '@/lib/content/loaders';
import { SEED_NEWS } from '@/lib/content/seed';

export const runtime = 'nodejs';
// Admin must read the LIVE manifest (its real generation), never the 300s-cached loader.
export const dynamic = 'force-dynamic';

const FILE = 'news.json';

/** Live read for the editor: returns the manifest + the generation to echo back on publish. */
export async function GET(): Promise<Response> {
  await requireAdmin();
  const res = await readManifest<NewsManifest>(FILE);
  if (!res) {
    // Not seeded yet — serve the bundled seed; generation "0" means "create if absent".
    return NextResponse.json({ manifest: SEED_NEWS, generation: '0' });
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

  const check = validateNewsManifest(body.manifest);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: 'invalid_manifest', details: check.errors }, { status: 400 });
  }

  try {
    await writeManifest(FILE, body.manifest, { ifGenerationMatch: body.generation });
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json(
        { ok: false, error: 'conflict', message: 'news changed elsewhere — reload and retry' },
        { status: 409 },
      );
    }
    console.error('[admin/news] write failed', err);
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 });
  }

  await publishManifest('news');

  // Re-read so the editor can adopt the fresh generation and publish again without a 409.
  const after = await readManifest<NewsManifest>(FILE);
  return NextResponse.json({ ok: true, generation: after?.generation ?? body.generation });
}
