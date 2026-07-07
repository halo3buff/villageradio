/**
 * Clearance — the site's checkpoint/firewall foundation.
 *
 * Pages don't trust HOW you arrived (link, swipe-back, deep link, bfcache
 * resurrection); they check WHETHER you hold clearance at render time.
 * Clearance is granted only by the site's own controls — the mobile command
 * prompt and official nav links — and lives in sessionStorage, so it lasts
 * for the browser session and dies with the tab.
 *
 * This makes iOS swipe-back irrelevant as a bypass: a resurrected or
 * deep-linked page without clearance renders the lock screen instead.
 *
 * Future traps build on this: one-time passes (revoke on arrival), decoy
 * redirects, degradation counters — all just policies over grant/has/revoke.
 */

const KEY_PREFIX = 'vr-clearance:';

/** Paths that sit behind a checkpoint. '/' and /information stay open — the
 *  terminal and the manual must always be reachable. */
export const GATED_PATHS = new Set(['/listen', '/news', '/photography', '/work', '/transmit']);

export function grantClearance(path: string): void {
  if (!GATED_PATHS.has(path)) return;
  try {
    sessionStorage.setItem(KEY_PREFIX + path, String(Date.now()));
  } catch { /* storage unavailable → hasClearance fails open */ }
}

export function hasClearance(path: string): boolean {
  if (!GATED_PATHS.has(path)) return true;
  try {
    return sessionStorage.getItem(KEY_PREFIX + path) !== null;
  } catch {
    // Storage blocked (some private modes) — fail OPEN. A broken lock that
    // shuts everyone out is worse than one that quietly stands down.
    return true;
  }
}

export function revokeClearance(path: string): void {
  try {
    sessionStorage.removeItem(KEY_PREFIX + path);
  } catch { /* nothing to do */ }
}
