import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { readManifest, writeManifest, ConflictError } from '@/lib/content/store';
import { publishManifest } from '@/lib/content/loaders';
import { REMARK_MAX, type LogManifest } from '@/lib/content/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILE = 'log.json';

/** Staged publish of the operator's remarks: optimistic write, then bust the public cache tag. */
export async function PUT(req: Request): Promise<Response> {
  await requireAdmin();
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });

  let body: { remarks?: unknown; generation?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  if (typeof body.generation !== 'string' || !body.generation) {
    return NextResponse.json({ ok: false, error: 'missing_generation' }, { status: 400 });
  }
  if (!body.remarks || typeof body.remarks !== 'object' || Array.isArray(body.remarks)) {
    return NextResponse.json({ ok: false, error: 'invalid_remarks' }, { status: 400 });
  }
  const remarks: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.remarks)) {
    if (!/^\d{1,5}$/.test(k) || typeof v !== 'string' || v.trim().length > REMARK_MAX) {
      return NextResponse.json({ ok: false, error: 'invalid_remark' }, { status: 400 });
    }
    if (v.trim()) remarks[String(Number(k))] = v.trim();
  }

  try {
    await writeManifest<LogManifest>(FILE, { version: 1, remarks }, { ifGenerationMatch: body.generation });
  } catch (err) {
    if (err instanceof ConflictError) return NextResponse.json({ ok: false, error: 'conflict' }, { status: 409 });
    console.error('[admin/log] write failed', err);
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 });
  }
  await publishManifest('log');

  const after = await readManifest<LogManifest>(FILE);
  return NextResponse.json({ ok: true, generation: after?.generation ?? body.generation });
}
