// Image serving. Admin-uploaded images live on Cloudflare R2 (same bucket as audio, free egress)
// under the `photos/` | `work/` prefixes and are served publicly via `next/image`. The 41
// original photos still ship in /public; until the one-time migration runs, their manifest keys
// are bare filenames and resolve to the legacy /public path — so the live site never breaks.

/** Public R2 dev URL — the same bucket the audio stream proxy reads (centralized here). */
export const R2_PUBLIC_BASE = 'https://pub-fa76dac35d0c4ddf9a81d5267a06b241.r2.dev';

const LEGACY_PHOTO_BASE = '/images/photography/negative';
const R2_PREFIXES = ['photos/', 'work/'];

/** Prefixed key → public R2 URL; bare legacy key → the in-repo /public photography path. */
function mediaUrl(key: string): string {
  if (R2_PREFIXES.some((prefix) => key.startsWith(prefix))) return `${R2_PUBLIC_BASE}/${key}`;
  return `${LEGACY_PHOTO_BASE}/${key}`;
}

export function photoUrl(key: string): string {
  return mediaUrl(key);
}

export function workImageUrl(key: string): string {
  return mediaUrl(key);
}
