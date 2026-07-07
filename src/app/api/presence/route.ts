import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { touchPresence, lastTransmission } from '@/lib/presence-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Heartbeat for the scope's RX counter + TX RECEIVED flicker.
 * GET /api/presence?id=<session-uuid> → { rx, tx }
 *   rx: receivers heard from in the last ~50s
 *   tx: timestamp (ms) of the most recent accepted transmission
 */
export async function GET(request: NextRequest): Promise<Response> {
  const id = request.nextUrl.searchParams.get('id');
  if (!id || id.length > 64) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  return NextResponse.json({ ok: true, rx: touchPresence(id), tx: lastTransmission() });
}
