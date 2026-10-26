import { AIR_BOX, aircraft } from '@/lib/air';

export const runtime = 'nodejs';

/** Live aircraft over Gaza, the West Bank and Israel, from adsb.lol's open ADS-B
 *  feed (no key). Cached 10 s, so every viewer shares one upstream call. */
export async function GET() {
  try {
    const r = await fetch('https://api.adsb.lol/v2/point/31.9/35.0/150', {
      headers: { 'User-Agent': 'vlgfm.live radar console (+https://vlgfm.live)' },   // adsb.lol refuses anonymous agents
      next: { revalidate: 10 },
    });
    if (!r.ok) throw new Error(`adsb.lol ${r.status}`);
    return Response.json({ t: Date.now(), ac: aircraft((await r.json()).ac ?? [], AIR_BOX) },
      { headers: { 'Cache-Control': 'public, s-maxage=10' } });
  } catch (e) {
    console.error('air', e);
    return Response.json({ t: Date.now(), ac: null }, { status: 502 });
  }
}
