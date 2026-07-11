import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { readManifest, writeManifest, ConflictError } from '@/lib/content/store';
import { publishManifest } from '@/lib/content/loaders';
import { isThemeName } from '@/lib/theme';
import type { SiteManifest } from '@/lib/types';

export const runtime = 'nodejs';
// Admin must read the LIVE config (its real generation), never the 300s-cached loader.
export const dynamic = 'force-dynamic';

const FILE = 'site.json';

/** Live read for the editor: returns the config + the generation to echo back on publish. */
export async function GET(): Promise<Response> {
  await requireAdmin();
  const res = await readManifest<SiteManifest>(FILE);
  if (res) return NextResponse.json({ theme: res.data.theme, generation: res.generation });
  return NextResponse.json({ theme: 'default', generation: '0' });
}

/** Staged publish: optimistic write, then bust the public cache tag. */
export async function PUT(req: Request): Promise<Response> {
  await requireAdmin();

  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });
  }

  let body: { theme?: unknown; generation?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  if (typeof body.generation !== 'string' || body.generation.length === 0) {
    return NextResponse.json({ ok: false, error: 'missing_generation' }, { status: 400 });
  }
  if (typeof body.theme !== 'string' || !isThemeName(body.theme)) {
    return NextResponse.json({ ok: false, error: 'invalid_theme' }, { status: 400 });
  }

  try {
    await writeManifest<SiteManifest>(FILE, { theme: body.theme }, { ifGenerationMatch: body.generation });
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json(
        { ok: false, error: 'conflict', message: 'settings changed elsewhere — reload and retry' },
        { status: 409 },
      );
    }
    console.error('[admin/site] write failed', err);
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 });
  }

  await publishManifest('site');
  // The theme is read in the ROOT layout, which every route's cached HTML embeds — a tag bust
  // alone doesn't reliably force every already-cached page to re-render. Purge the whole tree.
  revalidatePath('/', 'layout');

  const after = await readManifest<SiteManifest>(FILE);
  return NextResponse.json({ ok: true, generation: after?.generation ?? body.generation });
}
