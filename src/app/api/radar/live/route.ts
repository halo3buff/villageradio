import { getLive } from '@/lib/live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The radar console's state, polled by the open console every few seconds. */
export async function GET() {
  return Response.json(await getLive(), { headers: { 'Cache-Control': 'no-store' } });
}
