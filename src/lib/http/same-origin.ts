/**
 * Same-origin check for mutating requests (CSRF defense alongside the SameSite=Strict session
 * cookie). Browsers always send `Origin` on cross-site POST/PUT/DELETE; a missing Origin is
 * tolerated for non-browser clients (e.g. curl), which can't ride a victim's cookies anyway.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}
