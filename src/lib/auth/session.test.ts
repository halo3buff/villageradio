import { describe, it, expect } from 'vitest';
import { signSession, verifySession, sessionCookie, SESSION_COOKIE } from './session';

const SECRET = 'unit-test-secret-keep-it-long-enough';

describe('session', () => {
  it('round-trips a valid token', async () => {
    const token = await signSession({ exp: Date.now() + 10_000, v: 1 }, SECRET);
    const payload = await verifySession(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.v).toBe(1);
  });

  it('rejects a tampered token', async () => {
    const token = await signSession({ exp: Date.now() + 10_000, v: 1 }, SECRET);
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
    expect(await verifySession(tampered, SECRET)).toBeNull();
  });

  it('rejects the wrong secret', async () => {
    const token = await signSession({ exp: Date.now() + 10_000, v: 1 }, SECRET);
    expect(await verifySession(token, 'other-secret')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signSession({ exp: Date.now() - 1, v: 1 }, SECRET);
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it('rejects undefined', async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
  });

  it('builds a hardened cookie', () => {
    const c = sessionCookie('tok', 1000);
    expect(c.name).toBe(SESSION_COOKIE);
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('strict');
    expect(c.path).toBe('/');
    expect(c.maxAge).toBe(1);
  });
});
