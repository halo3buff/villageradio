import { daySegments, manifestToMixes, newsWindow } from '@/lib/content/broadcast';
import { getBroadcastManifest, getSiteManifest } from '@/lib/content/loaders';

export const runtime = 'nodejs';

/** The current lineup, for listeners already tuned in (see refreshLineup in audio-context). */
export async function GET() {
  const [manifest, site] = await Promise.all([getBroadcastManifest(), getSiteManifest()]);
  return Response.json({ playlist: manifestToMixes(manifest), segments: daySegments(manifest), news: newsWindow(site) });
}
