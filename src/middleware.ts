import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from './lib/rate-limit';

type Rule = {
  pattern: RegExp;
  limit: number;
  windowMs: number;
};

// Order matters: first match wins.
const RULES: Rule[] = [
  // Uploads land in paid Blob storage at up to 5 MB each — prime abuse target.
  { pattern: /^\/api\/transmissions(\/|$)/, limit: 10, windowMs: 60 * 60_000 },

  // Streaming uses Range requests; a single playback can issue many fetches.
  { pattern: /^\/api\/audio\/stream(\/|$)/, limit: 240, windowMs: 60_000 },

  // Cheap clock-sync endpoint, but clients call it on load.
  { pattern: /^\/api\/time(\/|$)/, limit: 60, windowMs: 60_000 },

  // Default for any future /api/* route.
  { pattern: /^\/api\//, limit: 60, windowMs: 60_000 },
];

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? '127.0.0.1';
}

export function middleware(req: NextRequest): NextResponse {
  const path = req.nextUrl.pathname;
  const rule = RULES.find((r) => r.pattern.test(path));
  if (!rule) return NextResponse.next();

  const ip = clientIp(req);
  const key = `${ip}:${rule.pattern.source}`;
  const result = checkRateLimit(key, rule.limit, rule.windowMs);

  const headers = new Headers();
  headers.set('X-RateLimit-Limit', String(result.limit));
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    headers.set('Retry-After', String(retryAfter));
    headers.set('Content-Type', 'application/json');
    return new NextResponse(
      JSON.stringify({ ok: false, error: 'rate_limited' }),
      { status: 429, headers },
    );
  }

  const res = NextResponse.next();
  headers.forEach((value, name) => res.headers.set(name, value));
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
