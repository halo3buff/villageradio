import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { sameOrigin } from '@/lib/http/same-origin';
import { assertSafeTransmissionName } from '@/lib/transmissions/names';
import { listQueue, keepTransmission, deleteTransmission } from '@/lib/transmissions/store';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  await requireAdmin();
  return NextResponse.json({ items: await listQueue() });
}

export async function POST(req: Request): Promise<Response> {
  await requireAdmin();
  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });
  }

  let body: { action?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const { action, name } = body;
  if (typeof name !== 'string' || name.length === 0) {
    return NextResponse.json({ ok: false, error: 'missing_name' }, { status: 400 });
  }
  if (action !== 'keep' && action !== 'delete') {
    return NextResponse.json({ ok: false, error: 'invalid_action' }, { status: 400 });
  }
  try {
    assertSafeTransmissionName(name);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_name' }, { status: 400 });
  }

  try {
    if (action === 'keep') await keepTransmission(name);
    else await deleteTransmission(name);
  } catch (err) {
    console.error('[admin/transmissions] move failed', err);
    return NextResponse.json({ ok: false, error: 'move_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
