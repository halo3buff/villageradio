/**
 * Generate a scrypt hash for the admin password.
 * Usage: node scripts/hash-password.mjs 'your-long-passphrase'
 * Store the printed value in Secret Manager as ADMIN_PASSWORD_HASH.
 */
import { scryptSync, randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs 'your-passphrase'");
  process.exit(1);
}
const N = 16384, R = 8, P = 1, KEYLEN = 64;
const salt = randomBytes(16);
const key = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
process.stdout.write(`scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}\n`);
