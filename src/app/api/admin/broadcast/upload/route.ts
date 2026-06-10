import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { probeDurationFromBuffer } from '@/lib/audio/probe';
import { putAudio } from '@/lib/storage/r2';

export const runtime = 'nodejs';

const MAX_BYTES = 12_582_912; // 12 MB — mixes are 3–8 MB, well under Cloud Run's request cap
const ALLOWED_TYPES = new Set(['audio/mpeg', 'audio/mp3']);
const FILENAME_RE = /^[A-Za-z0-9._-]+\.mp3$/;

function bad(error: string): Response {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

/** Sanitize a client-supplied filename into a safe R2 key, forcing the `.mp3` extension. */
function safeFilename(raw: string): string {
  let name = raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  if (!name.endsWith('.mp3')) name += '.mp3';
  return name;
}

/**
 * Through-app audio upload: browser → Cloud Run → R2. Validates content-type + size, sniffs
 * the MP3 frame magic (via the duration prober — a non-MP3 throws), then uploads server-side.
 * Returns the stored `file` + probed `durationSec` for the editor to stage as a new entry.
 */
export async function POST(req: Request): Promise<Response> {
  await requireAdmin();

  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return bad('invalid_form');
  }

  const audio = formData.get('audio');
  if (!(audio instanceof Blob)) return bad('missing_audio');
  if (!ALLOWED_TYPES.has(audio.type)) return bad('invalid_type');
  if (audio.size === 0) return bad('empty_audio');
  if (audio.size > MAX_BYTES) return bad('audio_too_large');

  const nameRaw = formData.get('filename');
  const declaredName =
    typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw : (audio as File).name || 'mix.mp3';
  const filename = safeFilename(declaredName);
  if (!FILENAME_RE.test(filename) || filename.includes('..')) return bad('invalid_filename');

  const buffer = Buffer.from(await audio.arrayBuffer());

  let durationSec: number;
  try {
    durationSec = probeDurationFromBuffer(new Uint8Array(buffer), buffer.length).durationSec;
  } catch {
    return bad('not_an_mp3'); // magic-byte sniff: no MPEG frame found
  }

  let file: string;
  try {
    file = await putAudio(filename, buffer, 'audio/mpeg');
  } catch (err) {
    console.error('[admin/broadcast/upload] R2 put failed', err);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, file, durationSec });
}
