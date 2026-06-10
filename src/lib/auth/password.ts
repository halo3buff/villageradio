import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

// Memory-hard params. mem ≈ 128*N*r = 16 MB, under scrypt's 32 MB default maxmem.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALTLEN = 16;

/** Returns `scrypt$N$r$p$saltB64url$keyB64url`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALTLEN);
  const key = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** Constant-time verify against a stored `scrypt$...` string. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!n || !r || !p) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64url');
    expected = Buffer.from(parts[5], 'base64url');
  } catch {
    return false;
  }
  if (salt.length !== SALTLEN || expected.length !== KEYLEN) return false;
  const actual = scryptSync(password, salt, expected.length, { N: n, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
