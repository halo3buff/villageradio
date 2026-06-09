import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { putImage } from '@/lib/storage/r2';
import { sniffImageType, EXT, safeImageName } from './validate';

// Shared through-app image upload: browser → Cloud Run → R2. Both the photos and work upload
// routes are identical bar the storage prefix, so the handler is factored out (DRY) and the
// route files are one-liners. Mirrors the broadcast audio upload: requireAdmin → sameOrigin →
// content-type allowlist + size cap → magic-byte sniff (the AUTHORITY on the real type) →
// safe prefixed key → putImage.

const MAX_BYTES = 10_485_760; // 10 MB — photos run larger than mixes, still well under the cap
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function bad(error: string): Response {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

/** Handle an image upload, storing under `prefix` (`'photos/'` | `'work/'`). Returns `{ ok, key }`. */
export async function handleImageUpload(req: Request, prefix: 'photos/' | 'work/'): Promise<Response> {
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

  const image = formData.get('image');
  if (!(image instanceof Blob)) return bad('missing_image');
  if (!ALLOWED_TYPES.has(image.type)) return bad('invalid_type');
  if (image.size === 0) return bad('empty_image');
  if (image.size > MAX_BYTES) return bad('image_too_large');

  const buffer = Buffer.from(await image.arrayBuffer());
  const sniffed = sniffImageType(new Uint8Array(buffer));
  if (!sniffed) return bad('not_an_image'); // magic-byte sniff: declared type is not trusted

  const nameRaw = formData.get('filename');
  const declared =
    typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw : (image as File).name || 'image';
  const key = prefix + safeImageName(declared, EXT[sniffed]);

  let stored: string;
  try {
    stored = await putImage(key, buffer, sniffed);
  } catch (err) {
    console.error('[admin image upload] R2 put failed', err);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, key: stored });
}
