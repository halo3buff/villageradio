import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { presignAudio } from '@/lib/storage/r2';

export const runtime = 'nodejs';

const FILENAME_RE = /^[A-Za-z0-9._-]+\.mp3$/;

function safeFilename(raw: string): string {
  let name = raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  if (!name.endsWith('.mp3')) name += '.mp3';
  return name;
}

/**
 * Returns a presigned R2 PUT URL so the browser can upload large audio files directly,
 * bypassing the Cloud Run 32 MB request body limit.
 * POST { filename: string } → { ok, url, key }
 */
export async function POST(req: Request): Promise<Response> {
  await requireAdmin();

  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });
  }

  let body: { filename?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  if (typeof body.filename !== 'string' || !body.filename.trim()) {
    return NextResponse.json({ ok: false, error: 'missing_filename' }, { status: 400 });
  }

  const filename = safeFilename(body.filename);
  if (!FILENAME_RE.test(filename) || filename.includes('..')) {
    return NextResponse.json({ ok: false, error: 'invalid_filename' }, { status: 400 });
  }

  try {
    const { url, key } = await presignAudio(filename);
    return NextResponse.json({ ok: true, url, key });
  } catch (err) {
    console.error('[admin/broadcast/presign] failed', err);
    return NextResponse.json({ ok: false, error: 'presign_failed' }, { status: 500 });
  }
}
