import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { markTransmission } from '@/lib/presence-store';

export const runtime = 'nodejs';

const MAX_BYTES = 5_242_880; // 5 MB

// One client per warm instance. On Cloud Run this authenticates via the attached
// runtime service account (ADC); locally via `gcloud auth application-default login`.
const storage = new Storage();

function bucketName(): string {
  const name = process.env.TRANSMISSIONS_BUCKET;
  if (!name) throw new Error('TRANSMISSIONS_BUCKET is not set');
  return name;
}

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
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

export async function POST(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    console.error('[transmissions] form parse failed', err);
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const audio = form.get('audio');
  const handleRaw = form.get('handle');

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'missing_audio' }, { status: 400 });
  }
  if (!audio.type.startsWith('audio/webm')) {
    return NextResponse.json({ ok: false, error: 'invalid_audio_type' }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ ok: false, error: 'empty_audio' }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'audio_too_large' }, { status: 400 });
  }

  const handle = sanitizeHandle(typeof handleRaw === 'string' ? handleRaw : null);
  // Lands in the moderation queue's incoming prefix (Phase 5); admin keeps → kept/ or trashes → trash/.
  const key = `transmissions/new/${isoTimestampForKey()}-${handle}-${randomSuffix()}.webm`;

  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    // Private object; uniform bucket-level access + public-access-prevention keep it so.
    await storage.bucket(bucketName()).file(key).save(buffer, {
      contentType: 'audio/webm',
      resumable: false,
    });
  } catch (err) {
    console.error('[transmissions] upload failed', err);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  // Ping the broadcast-liveness layer — homepage scopes flicker TX RECEIVED.
  markTransmission();

  return NextResponse.json({ ok: true });
}
