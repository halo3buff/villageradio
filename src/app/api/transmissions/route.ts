import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

const MAX_BYTES = 5_242_880; // 5 MB

function sanitizeHandle(raw: string | null): string {
  if (!raw) return 'anon';
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_\-.]/g, '').slice(0, 64);
  return cleaned.length === 0 ? 'anon' : cleaned;
}

function isoTimestampForKey(): string {
  // 2026-05-17T22-14-03Z — filesystem-safe
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function POST(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const audio = form.get('audio');
  const handleRaw = form.get('handle');

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'missing_audio' }, { status: 400 });
  }
  if (!audio.type.startsWith('audio/')) {
    return NextResponse.json({ ok: false, error: 'invalid_audio_type' }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ ok: false, error: 'empty_audio' }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'audio_too_large' }, { status: 400 });
  }

  const handle = sanitizeHandle(typeof handleRaw === 'string' ? handleRaw : null);
  const key = `transmissions/${isoTimestampForKey()}-${handle}-${randomSuffix()}.webm`;

  try {
    await put(key, audio, {
      access: 'public',
      addRandomSuffix: false,
      contentType: audio.type,
    });
  } catch (err) {
    console.error('[transmissions] upload failed', err);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
