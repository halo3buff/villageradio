import { createHmac, randomBytes } from 'node:crypto';

export const POW_DIFFICULTY = 20; // avg ~1M hashes ≈ 1–2 s on mobile

// ── Server ───────────────────────────────────────────────────────────────────

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex').slice(0, 24);
}

/** Returns a tamper-proof signed challenge. Server-side only. */
export function createChallenge(secret: string): string {
  const rand = randomBytes(16).toString('hex');
  const ts = Date.now().toString();
  return `${rand}.${ts}.${sign(`${rand}.${ts}`, secret)}`;
}

/**
 * Verifies the challenge was issued by this server and is less than 10 minutes old.
 * Prevents clients from fabricating easy challenges.
 */
export function validateChallenge(challenge: string, secret: string): boolean {
  const parts = challenge.split('.');
  if (parts.length !== 3) return false;
  const [rand, ts, sig] = parts;
  const age = Date.now() - Number(ts);
  if (isNaN(age) || age < 0 || age > 10 * 60 * 1000) return false;
  return sig === sign(`${rand}.${ts}`, secret);
}

/** Verifies a PoW solution server-side. Requires Node.js 18+ global crypto. */
export async function verifyPoW(challenge: string, nonce: string): Promise<boolean> {
  const data = new TextEncoder().encode(`${challenge}:${nonce}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new DataView(hash).getUint32(0) < 2 ** (32 - POW_DIFFICULTY);
}

// ── Client ───────────────────────────────────────────────────────────────────

/**
 * Finds a nonce whose SHA-256(challenge:nonce) has `difficulty` leading zero bits.
 * Yields to the UI every 5 000 iterations so the page doesn't freeze.
 */
export async function solvePoW(challenge: string, difficulty: number): Promise<string> {
  const target = 2 ** (32 - difficulty);
  const enc = new TextEncoder();
  for (let nonce = 0; ; nonce++) {
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(`${challenge}:${nonce}`));
    if (new DataView(hash).getUint32(0) < target) return String(nonce);
    if (nonce % 5000 === 0) await new Promise<void>(r => setTimeout(r, 0));
  }
}
