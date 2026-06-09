import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';
import { verifyPassword } from '@/lib/auth/password';
import { signSession, sessionCookie } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60_000;

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? '127.0.0.1';
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // tolerate non-browser clients; browsers send Origin on POST
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

// Length-independent constant-time compare via fixed-width digests.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i]! ^ hb[i]!;
  return diff === 0;
}

export async function POST(req: Request): Promise<Response> {
  // Defense in depth: rate-limit here too, not only in middleware.
  const ip = clientIp(req);
  const rl = checkRateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const cfg = authConfig();
  const userOk = safeEqual(username, cfg.username);
  const passOk = verifyPassword(password, cfg.passwordHash);
  if (!userOk || !passOk) {
    return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
  }

  const token = await signSession(
    { exp: Date.now() + cfg.sessionTtlMs, v: cfg.sessionVersion },
    cfg.sessionSecret,
  );
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(token, cfg.sessionTtlMs));
  return res;
}
