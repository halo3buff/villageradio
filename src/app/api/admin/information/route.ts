import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { readText, writeText, ConflictError } from '@/lib/content/store';
import { publishManifest } from '@/lib/content/loaders';

export const runtime = 'nodejs';
// Admin must read the LIVE document (its real generation), never the 300s-cached loader.
export const dynamic = 'force-dynamic';

const FILE = 'information.md';
const MAX_BYTES = 262_144; // 256 KB — a single editorial document; well above any realistic page

/** Live read for the editor: returns the document + the generation to echo back on publish. */
export async function GET(): Promise<Response> {
  await requireAdmin();
  const res = await readText(FILE);
  if (res) return NextResponse.json({ text: res.text, generation: res.generation });
  // Not seeded yet — serve the bundled doc so the editor starts from the current live content;
  // generation "0" means "create if absent".
  const text = readFileSync(join(process.cwd(), 'public', 'information', 'info_page.md'), 'utf-8');
  return NextResponse.json({ text, generation: '0' });
}

/** Staged publish: optimistic write of the whole document, then bust the public cache tag. */
export async function PUT(req: Request): Promise<Response> {
  await requireAdmin();

  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });
  }

  let body: { text?: unknown; generation?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  if (typeof body.generation !== 'string' || body.generation.length === 0) {
    return NextResponse.json({ ok: false, error: 'missing_generation' }, { status: 400 });
  }
  if (typeof body.text !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_text' }, { status: 400 });
  }
  if (Buffer.byteLength(body.text, 'utf-8') > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'text_too_large' }, { status: 400 });
  }

  try {
    await writeText(FILE, body.text, { ifGenerationMatch: body.generation });
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json(
        { ok: false, error: 'conflict', message: 'information changed elsewhere — reload and retry' },
        { status: 409 },
      );
    }
    console.error('[admin/information] write failed', err);
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 });
  }

  await publishManifest('information');

  // Re-read so the editor can adopt the fresh generation and publish again without a 409.
  const after = await readText(FILE);
  return NextResponse.json({ ok: true, generation: after?.generation ?? body.generation });
}
