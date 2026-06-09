import { requireAdmin } from '@/lib/auth/guard';
import { assertSafeTransmissionName } from '@/lib/transmissions/names';
import { downloadTransmission } from '@/lib/transmissions/store';

export const runtime = 'nodejs';

// Plays back a private GCS transmission for moderation. Admin-gated (proxy 404 + requireAdmin)
// and validated against path traversal before any read — mirrors /api/audio/stream, but the bytes
// come from the private TRANSMISSIONS_BUCKET via ADC rather than the public R2 URL.
export async function GET(req: Request): Promise<Response> {
  await requireAdmin();

  const name = new URL(req.url).searchParams.get('name');
  if (!name) return new Response('Bad request', { status: 400 });
  try {
    assertSafeTransmissionName(name);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const { body, contentType } = await downloadTransmission(name);
  const bytes = new Uint8Array(body);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
