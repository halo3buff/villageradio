export interface AuthConfig {
  username: string;
  passwordHash: string;
  sessionSecret: string;
  sessionVersion: number;
  sessionTtlMs: number;
  loginPath: string;
}

/**
 * Reads admin auth settings from env (sourced from Secret Manager on Cloud Run).
 * Not cached — re-reading each call keeps it test-friendly and honors secret rotation.
 */
export function authConfig(): AuthConfig {
  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!username || !passwordHash || !sessionSecret) {
    throw new Error(
      'Missing admin auth env: ADMIN_USERNAME, ADMIN_PASSWORD_HASH, SESSION_SECRET',
    );
  }
  return {
    username,
    passwordHash,
    sessionSecret,
    sessionVersion: Number(process.env.SESSION_VERSION ?? '1'),
    sessionTtlMs: Number(process.env.SESSION_TTL_MS ?? String(8 * 60 * 60 * 1000)),
    loginPath: process.env.ADMIN_LOGIN_PATH ?? '/relay',
  };
}
