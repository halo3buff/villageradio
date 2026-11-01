import { daySegments, manifestToMixes } from '@/lib/content/broadcast';
import { getBroadcastManifest } from '@/lib/content/loaders';

export const runtime = 'nodejs';

/** The current lineup, for listeners already tuned in (see refreshLineup in audio-context). */
export async function GET() {
  const manifest = await getBroadcastManifest();
  return Response.json({ playlist: manifestToMixes(manifest), segments: daySegments(manifest) });
}
