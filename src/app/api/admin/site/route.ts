import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { readManifest, writeManifest, ConflictError } from '@/lib/content/store';
import { publishManifest } from '@/lib/content/loaders';
import { isThemeName } from '@/lib/theme';
import type { NewsHour, SiteManifest } from '@/lib/types';
import { DEFAULT_NEWS } from '@/lib/content/broadcast';

export const runtime = 'nodejs';
// Admin must read the LIVE config (its real generation), never the 300s-cached loader.
export const dynamic = 'force-dynamic';

const FILE = 'site.json';

/** Live read for the editor: returns the config + the generation to echo back on publish. */
export async function GET(): Promise<Response> {
  await requireAdmin();
  const res = await readManifest<SiteManifest>(FILE);
  if (res) return NextResponse.json({ theme: res.data.theme, news: res.data.news ?? DEFAULT_NEWS, generation: res.generation });
  return NextResponse.json({ theme: 'default', news: DEFAULT_NEWS, generation: '0' });
}

/** A news hour from the editor, checked field by field; null if anything is off. */
function parseNews(v: unknown): NewsHour | null {
  if (!v || typeof v !== 'object') return null;
  const n = v as Record<string, unknown>;
  const int = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;
  if (typeof n.on !== 'boolean') return null;
  if (typeof n.url !== 'string' || !/^https:\/\/\S+$/.test(n.url) || n.url.length > 500) return null;
  if (!int(n.start, 0, 86_399) || !int(n.minutes, 1, 240)) return null;
  if (typeof n.name !== 'string' || n.name.length > 60) return null;
  return { on: n.on, url: n.url, start: n.start as number, minutes: n.minutes as number, name: n.name.trim() };
}

/** Staged publish: optimistic write, then bust the public cache tag. */
export async function PUT(req: Request): Promise<Response> {
  await requireAdmin();

  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });
  }

  let body: { theme?: unknown; news?: unknown; generation?: unknown };
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

  const news = body.news === undefined ? undefined : parseNews(body.news);
  if (news === null) {
    return NextResponse.json({ ok: false, error: 'invalid_news' }, { status: 400 });
  }

  try {
    // a body without news keeps what's saved (the generation check makes that read safe)
    const keep = news ?? (await readManifest<SiteManifest>(FILE))?.data.news;
    await writeManifest<SiteManifest>(FILE, { theme: body.theme, ...(keep && { news: keep }) }, { ifGenerationMatch: body.generation });
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
