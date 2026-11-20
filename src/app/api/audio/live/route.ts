import { getSiteManifest } from '@/lib/content/loaders';
import { DEFAULT_NEWS, newsWindow, secondsIntoDay } from '@/lib/content/broadcast';
import { isAdmin } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A few minutes either side, so a listener tuning in on the dot (or a skewed clock) isn't refused.
const GRACE_SEC = 300;

/** The news hour's live stream, relayed same-origin so the station's analysers can read it
 *  (cross-origin audio feeds Web Audio silence). Open only during the hour — or to the admin. */
export async function GET(req: Request) {
  const site = await getSiteManifest();
  const win = newsWindow(site);
  const url = (site.news ?? DEFAULT_NEWS).url;
  const sec = secondsIntoDay(Date.now());
  const onAir = win && sec >= win.start - GRACE_SEC && sec < win.end + GRACE_SEC;
  if (!win || (!onAir && !(await isAdmin()))) return new Response('Off air', { status: 404 });

  let upstream: Response;
  try {
    // the listener leaving aborts the upstream pull too
    upstream = await fetch(url, { signal: req.signal, headers: { 'Icy-MetaData': '0' } });
  } catch (err) {
    console.error('[audio-live] upstream fetch failed', err);
    return new Response('Upstream error', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new Response('Upstream error', { status: 502 });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}
