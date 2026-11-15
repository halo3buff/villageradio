import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { touchPresence, touchListener, lastTransmission } from '@/lib/presence-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Heartbeat for the scope's RX counter + TX RECEIVED flicker.
 * GET /api/presence?id=<session-uuid> → { rx, tx }
 *   rx: receivers heard from in the last ~50s
 *   tx: timestamp (ms) of the most recent accepted transmission
 * GET /api/presence?id=<session-uuid>&rx=1 → { ok } — a station listener's heartbeat (see the log's RX)
 */
export async function GET(request: NextRequest): Promise<Response> {
  const id = request.nextUrl.searchParams.get('id');
  if (!id || id.length > 64) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (request.nextUrl.searchParams.has('rx')) {
    touchListener(id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: true, rx: touchPresence(id), tx: lastTransmission() });
}
