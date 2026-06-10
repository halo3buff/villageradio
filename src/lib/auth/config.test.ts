import { describe, it, expect, beforeEach } from 'vitest';
import { authConfig } from './config';

const base = {
  ADMIN_USERNAME: 'adnan',
  ADMIN_PASSWORD_HASH: 'scrypt$16384$8$1$abc$def',
  SESSION_SECRET: 'x'.repeat(32),
};

beforeEach(() => {
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.SESSION_SECRET;
  delete process.env.SESSION_TTL_MS;
  delete process.env.SESSION_VERSION;
});

describe('authConfig', () => {
  it('throws when a required secret is missing', () => {
    expect(() => authConfig()).toThrow(/Missing admin auth env/);
  });

  it('returns config with defaults when env is set', () => {
    Object.assign(process.env, base);
    const c = authConfig();
    expect(c.username).toBe('adnan');
    expect(c.sessionTtlMs).toBe(8 * 60 * 60 * 1000);
    expect(c.sessionVersion).toBe(1);
  });

  it('honors overrides', () => {
    Object.assign(process.env, base, { SESSION_TTL_MS: '1000', SESSION_VERSION: '4' });
    const c = authConfig();
    expect(c.sessionTtlMs).toBe(1000);
    expect(c.sessionVersion).toBe(4);
  });
});
