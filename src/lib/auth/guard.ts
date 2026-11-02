import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { verifySession, SESSION_COOKIE } from './session';
import { authConfig } from './config';

/**
 * Re-checks the session inside a server component or route handler — never trust the
 * proxy gate alone. Calls `notFound()` (renders the 404) when unauthenticated,
 * matching the "the panel doesn't exist" behavior.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) notFound();
}

/** Whether the request carries a valid admin session, without 404ing when it doesn't. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const cfg = authConfig();
  return !!(await verifySession(token, cfg.sessionSecret, cfg.sessionVersion));
}
