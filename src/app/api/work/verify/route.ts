import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const ATTEMPTS = 3;
const BLOCK_MS = 5 * 60 * 60 * 1000;

// sha256 hashes — plaintext never ships to the browser
const HASH_REGULAR = Buffer.from('22ccdf0229ced3e0ac43092ea124364687e8e83e5b11a9fb7c1c4a35da182a2e', 'hex');
const HASH_BYPASS  = Buffer.from('0950639951d147aab23e14a3f16e0fede83c753a8812b23683b698324d96d743', 'hex');

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? '127.0.0.1';
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  const rl = checkRateLimit(`work:${ip}`, ATTEMPTS, BLOCK_MS);
  if (!rl.allowed) {
    const hours = Math.ceil((rl.resetAt - Date.now()) / 3600000);
    return NextResponse.json({ ok: false, error: 'blocked', hours }, { status: 429 });
  }

  let body: { password?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 }); }

  const password = typeof body.password === 'string' ? body.password : '';
  const hash = createHash('sha256').update(password).digest();

  if (timingSafeEqual(hash, HASH_BYPASS)) {
    return NextResponse.json({ ok: true, bypass: true });
  }

  if (timingSafeEqual(hash, HASH_REGULAR)) {
    return NextResponse.json({ ok: true, bypass: false });
  }

  return NextResponse.json(
    { ok: false, error: 'wrong', remaining: rl.remaining },
    { status: 401 },
  );
}
