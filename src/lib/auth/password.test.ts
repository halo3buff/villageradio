import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('verifies a correct password', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('Tr0ubador', stored)).toBe(false);
  });

  it('produces a salted format string', () => {
    const stored = hashPassword('hunter2');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored.split('$')).toHaveLength(6);
  });

  it('rejects malformed stored hashes', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
  });

  it('rejects a stored hash with a wrong-length key (no empty-buffer bypass)', () => {
    // 'A' decodes to 0 base64url bytes; must NOT authenticate.
    expect(verifyPassword('anything', 'scrypt$16384$8$1$aass$A')).toBe(false);
    // empty key part → 0 bytes → must NOT authenticate either.
    expect(verifyPassword('anything', 'scrypt$16384$8$1$YWJjZGVmZ2hpamtsbW5vcA$')).toBe(false);
  });
});
