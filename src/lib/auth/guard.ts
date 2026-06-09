import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { verifySession, SESSION_COOKIE } from './session';
import { authConfig } from './config';

/**
 * Re-checks the session inside a server component or route handler — never trust the
 * middleware gate alone. Calls `notFound()` (renders the 404) when unauthenticated,
 * matching the "the panel doesn't exist" behavior.
 */
export async function requireAdmin(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = await verifySession(token, authConfig().sessionSecret);
  if (!payload) notFound();
}
