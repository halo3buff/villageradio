import { AIR_BOX, FIX_EVERY, aircraft, type Aircraft } from '@/lib/air';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The latest fix, shared by every viewer: the server takes a fresh one at most every
// FIX_EVERY ms and serves this in between.
// ponytail: per-instance memory; fine on one container, a shared cache if it ever scales out.
let last: { t: number; ac: Aircraft[] } | null = null;
let inflight: Promise<void> | null = null;

async function refresh() {
  const r = await fetch('https://opendata.adsb.fi/api/v3/lat/31.9/lon/35.0/dist/150', {
    headers: { 'User-Agent': 'vlgfm.live radar console (+https://vlgfm.live)' },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`adsb.fi ${r.status}`);
  last = { t: Date.now(), ac: aircraft((await r.json()).ac ?? [], AIR_BOX) };
}

/** Aircraft over Gaza, the West Bank and Israel, from adsb.fi's open ADS-B feed (personal, non-commercial use; cite adsb.fi).
 *  `t` is when the fix was taken; a refused refresh keeps serving the last good one. */
export async function GET() {
  if (!last || Date.now() - last.t >= FIX_EVERY) {
    inflight ??= refresh().catch(e => console.error('air', e)).finally(() => { inflight = null; });
    await inflight;
  }
  return last
    ? Response.json(last, { headers: { 'Cache-Control': 'no-store' } })
    : Response.json({ t: Date.now(), ac: null }, { status: 502 });
}
