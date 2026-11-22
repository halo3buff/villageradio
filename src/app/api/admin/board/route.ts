import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { writeManifest } from '@/lib/content/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface BoardSound { file: string; name: string }
export interface BoardManifest { version: 1; sounds: BoardSound[] }

const SAFE_FILE = /^[A-Za-z0-9._-]+\.mp3$/;

/** The mixer's sound board (intros, outros, signatures), written whole. One operator, so no generation check. */
export async function PUT(req: Request): Promise<Response> {
  await requireAdmin();
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });

  let body: { sounds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  if (!Array.isArray(body.sounds)) return NextResponse.json({ ok: false, error: 'invalid_sounds' }, { status: 400 });
  const sounds: BoardSound[] = [];
  for (const s of body.sounds as Partial<BoardSound>[]) {
    if (!s || typeof s.file !== 'string' || !SAFE_FILE.test(s.file) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80) {
      return NextResponse.json({ ok: false, error: 'invalid_sound' }, { status: 400 });
    }
    sounds.push({ file: s.file, name: s.name.trim() });
  }

  try {
    await writeManifest<BoardManifest>('board.json', { version: 1, sounds });
  } catch (err) {
    console.error('[admin/board] write failed', err);
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
