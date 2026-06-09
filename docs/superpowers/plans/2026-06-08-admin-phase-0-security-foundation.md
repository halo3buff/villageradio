# Admin Phase 0 — Security Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the locked front door — a hidden, authenticated admin gate so that `/admin/*` 404s for anyone without a valid session, a working login, and the soot-sprite entry — before any content editing exists.

**Architecture:** A stateless signed-cookie session (HMAC via Web Crypto so it verifies in the Edge-runtime middleware). Middleware gates every `/admin` + `/api/admin` route: no valid session → rewrite to a 404. The Node-runtime login route verifies the single shared credential with a slow scrypt hash and issues the cookie. Per-route `requireAdmin()` re-checks server-side (defense in depth). A client-side key sequence summons the soot sprite, which links to an unguessable login path.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind v4, Node `crypto` (scrypt) + Web Crypto (HMAC), Vitest (new, dev-only).

---

## Decisions made in this plan (veto before executing if you disagree)

1. **scrypt, not Argon2id.** Node's built-in `crypto.scryptSync` is a memory-hard slow hash, needs **no dependency** and **no native build** on `node:20-alpine`. The spec named Argon2id; this is a security-equivalent substitution for a single admin password. Upgrade path: `@node-rs/argon2` (prebuilt musl binaries) — swap `password.ts` only.
2. **Session via Web Crypto HMAC** (not `node:crypto`), because Next.js **middleware runs in the Edge runtime** where `node:crypto` is unavailable. Same code runs fine in Node too.
3. **Login path = `/relay`** (constant in `auth/config.ts`, overridable via `ADMIN_LOGIN_PATH`). Obscurity only; the real lock is auth. Change the constant to taste.
4. **Key sequence = Konami code** (`↑↑↓↓←→←→ b a`) as the default trigger; constant in `SootSprite.tsx`.

---

## File structure

**Create**
- `src/lib/auth/config.ts` — reads/validates auth env (username, password hash, session secret, ttl, login path).
- `src/lib/auth/password.ts` — `hashPassword` / `verifyPassword` (scrypt, constant-time).
- `src/lib/auth/session.ts` — `signSession` / `verifySession` (Web Crypto HMAC) + cookie helpers.
- `src/lib/auth/gate.ts` — pure `gateDecision(pathname, hasValidSession)`.
- `src/lib/auth/guard.ts` — `requireAdmin()` for server components/route handlers (per-route re-check).
- `src/app/api/admin/login/route.ts` — POST login (Node runtime).
- `src/app/api/admin/logout/route.ts` — POST logout.
- `src/app/relay/page.tsx` + `src/app/relay/login-form.tsx` — login page (secret path).
- `src/app/admin/page.tsx` — redirect to `/admin/broadcast`.
- `src/app/admin/broadcast/page.tsx` — minimal gated placeholder (proves the gate).
- `src/app/blackhole/page.tsx` — always-404 target for the gate rewrite.
- `src/app/not-found.tsx` — styled 404 (so gated routes are indistinguishable from missing ones).
- `src/components/SootSprite.tsx` — key-sequence listener + sprite + link to login.
- `scripts/hash-password.mjs` — generate a scrypt hash to store in Secret Manager.
- `vitest.config.ts` — test config with `@/` alias.
- Tests: `src/lib/auth/{password,session,gate,config}.test.ts`, `src/app/api/admin/login/route.test.ts`.

**Modify**
- `src/middleware.ts` — add the admin gate + login rate-limit rule; matcher includes `/admin`.
- `src/app/layout.tsx` — mount `<SootSprite />` site-wide.
- `.github/workflows/deploy.yml` — inject secrets via `--set-secrets`.
- `package.json` — add Vitest dev dep + `test` scripts (no runtime deps).
- `.env.local` — add admin auth vars for local dev.

---

## Task 1: Add Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/auth/smoke.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the test script and dev dependency to `package.json`**

In `"scripts"` add:
```json
"test": "vitest run",
"test:watch": "vitest"
```
In `"devDependencies"` add:
```json
"vitest": "^2.1.8"
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: `vitest` added, lockfile updated.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { environment: 'node' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
```

- [ ] **Step 4: Write a smoke test**

`src/lib/auth/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/auth/smoke.test.ts
git commit -m "test: add Vitest for the admin auth foundation"
```

---

## Task 2: Auth config module

**Files:**
- Create: `src/lib/auth/config.ts`
- Test: `src/lib/auth/config.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/auth/config.test.ts`:
```ts
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
  delete process.env.ADMIN_LOGIN_PATH;
  delete process.env.SESSION_TTL_MS;
});

describe('authConfig', () => {
  it('throws when a required secret is missing', () => {
    expect(() => authConfig()).toThrow(/Missing admin auth env/);
  });

  it('returns config with defaults when env is set', () => {
    Object.assign(process.env, base);
    const c = authConfig();
    expect(c.username).toBe('adnan');
    expect(c.loginPath).toBe('/relay');
    expect(c.sessionTtlMs).toBe(8 * 60 * 60 * 1000);
    expect(c.sessionVersion).toBe(1);
  });

  it('honors overrides', () => {
    Object.assign(process.env, base, { ADMIN_LOGIN_PATH: '/dial', SESSION_TTL_MS: '1000' });
    const c = authConfig();
    expect(c.loginPath).toBe('/dial');
    expect(c.sessionTtlMs).toBe(1000);
  });
});
```

- [ ] **Step 2: Run it (fails — module missing)**

Run: `npx vitest run src/lib/auth/config.test.ts`
Expected: FAIL — cannot find `./config`.

- [ ] **Step 3: Implement `src/lib/auth/config.ts`**

```ts
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
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/lib/auth/config.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/config.ts src/lib/auth/config.test.ts
git commit -m "feat(auth): admin auth config from env"
```

---

## Task 3: Password hashing (scrypt)

**Files:**
- Create: `src/lib/auth/password.ts`
- Create: `scripts/hash-password.mjs`
- Test: `src/lib/auth/password.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/auth/password.test.ts`:
```ts
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
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/lib/auth/password.test.ts`
Expected: FAIL — cannot find `./password`.

- [ ] **Step 3: Implement `src/lib/auth/password.ts`**

```ts
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
  const actual = scryptSync(password, salt, expected.length, { N: n, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/lib/auth/password.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Create `scripts/hash-password.mjs`**

```js
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
```

- [ ] **Step 6: Verify the script round-trips**

Run: `node scripts/hash-password.mjs 'test pass'`
Expected: prints a line starting with `scrypt$16384$8$1$`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/password.ts src/lib/auth/password.test.ts scripts/hash-password.mjs
git commit -m "feat(auth): scrypt password hashing + hash-password script"
```

---

## Task 4: Session sign/verify (Web Crypto) + cookie helper

**Files:**
- Create: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/auth/session.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/lib/auth/session.test.ts`
Expected: FAIL — cannot find `./session`.

- [ ] **Step 3: Implement `src/lib/auth/session.ts`**

```ts
import { authConfig } from './config';

export const SESSION_COOKIE = 'vr_session';

export interface SessionPayload {
  exp: number; // epoch ms
  v: number; // session version (rotate to revoke all)
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return `${body}.${b64urlEncode(sig)}`;
}

export async function verifySession(
  token: string | undefined,
  secret: string = authConfig().sessionSecret,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const key = await hmacKey(secret);
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(dec.decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}

/** Cookie options object compatible with Next's `cookies().set` / `response.cookies.set`. */
export function sessionCookie(token: string, ttlMs: number) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: Math.floor(ttlMs / 1000),
  };
}

export function clearedSessionCookie() {
  return { ...sessionCookie('', 0), maxAge: 0 };
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/lib/auth/session.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat(auth): stateless HMAC session tokens (Web Crypto) + cookie helpers"
```

---

## Task 5: Gate decision (pure)

**Files:**
- Create: `src/lib/auth/gate.ts`
- Test: `src/lib/auth/gate.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/auth/gate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { gateDecision } from './gate';

describe('gateDecision', () => {
  it('passes non-admin paths', () => {
    expect(gateDecision('/listen', false)).toBe('pass');
    expect(gateDecision('/relay', false)).toBe('pass');
    expect(gateDecision('/api/audio/stream', false)).toBe('pass');
  });

  it('opens the login + logout endpoints without a session', () => {
    expect(gateDecision('/api/admin/login', false)).toBe('open');
    expect(gateDecision('/api/admin/logout', false)).toBe('open');
  });

  it('404s admin pages without a session', () => {
    expect(gateDecision('/admin', false)).toBe('notfound');
    expect(gateDecision('/admin/broadcast', false)).toBe('notfound');
    expect(gateDecision('/api/admin/broadcast', false)).toBe('notfound');
  });

  it('passes admin paths with a valid session', () => {
    expect(gateDecision('/admin/broadcast', true)).toBe('pass');
    expect(gateDecision('/api/admin/broadcast', true)).toBe('pass');
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/lib/auth/gate.test.ts`
Expected: FAIL — cannot find `./gate`.

- [ ] **Step 3: Implement `src/lib/auth/gate.ts`**

```ts
export type GateDecision = 'pass' | 'notfound' | 'open';

const OPEN_ENDPOINTS = new Set(['/api/admin/login', '/api/admin/logout']);

/**
 * Pure gate decision used by middleware.
 * - 'open'     → auth endpoints, reachable without a session (still rate-limited)
 * - 'notfound' → gated admin route with no valid session → render a 404
 * - 'pass'     → everything else
 */
export function gateDecision(pathname: string, hasValidSession: boolean): GateDecision {
  const isAdmin =
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/api/admin/');
  if (!isAdmin) return 'pass';
  if (OPEN_ENDPOINTS.has(pathname)) return 'open';
  return hasValidSession ? 'pass' : 'notfound';
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/lib/auth/gate.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/gate.ts src/lib/auth/gate.test.ts
git commit -m "feat(auth): pure admin gate decision"
```

---

## Task 6: Server-side guard (defense in depth)

**Files:**
- Create: `src/lib/auth/guard.ts`

- [ ] **Step 1: Implement `src/lib/auth/guard.ts`**

```ts
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { verifySession, SESSION_COOKIE } from './session';
import { authConfig } from './config';

/**
 * Re-checks the session inside a server component or route handler — never trust the
 * middleware gate alone. Calls `notFound()` (renders the 404) when unauthenticated,
 * matching the "the panel doesn't exist" behavior.
 */
export async function requireAdmin(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = await verifySession(token, authConfig().sessionSecret);
  if (!payload) notFound();
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/guard.ts
git commit -m "feat(auth): requireAdmin server-side guard"
```

---

## Task 7: Wire the middleware gate + 404 target + styled not-found

**Files:**
- Modify: `src/middleware.ts`
- Create: `src/app/blackhole/page.tsx`
- Create: `src/app/not-found.tsx`

- [ ] **Step 1: Create the 404 rewrite target `src/app/blackhole/page.tsx`**

```tsx
import { notFound } from 'next/navigation';

// Middleware rewrites unauthenticated admin requests here so the styled 404 renders
// at the original URL — admin routes look identical to genuinely missing pages.
export default function Blackhole(): never {
  notFound();
}
```

- [ ] **Step 2: Create `src/app/not-found.tsx`**

```tsx
export default function NotFound() {
  return (
    <div className="px-5 pt-20 pb-10 page-enter">
      <p className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-white/40">
        404 — not found
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Replace `src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from './lib/rate-limit';
import { verifySession, SESSION_COOKIE } from './lib/auth/session';
import { gateDecision } from './lib/auth/gate';

type Rule = { pattern: RegExp; limit: number; windowMs: number };

// Order matters: first match wins.
const RULES: Rule[] = [
  // Admin login — strict: brute-force target.
  { pattern: /^\/api\/admin\/login$/, limit: 10, windowMs: 15 * 60_000 },
  // Uploads land in paid storage — prime abuse target.
  { pattern: /^\/api\/transmissions(\/|$)/, limit: 10, windowMs: 60 * 60_000 },
  // Streaming uses Range requests; a single playback can issue many fetches.
  { pattern: /^\/api\/audio\/stream(\/|$)/, limit: 240, windowMs: 60_000 },
  // Cheap clock-sync endpoint, but clients call it on load.
  { pattern: /^\/api\/time(\/|$)/, limit: 60, windowMs: 60_000 },
  // Default for any other /api/* route.
  { pattern: /^\/api\//, limit: 60, windowMs: 60_000 },
];

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? '127.0.0.1';
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;

  // 1. Admin gate (defense-in-depth layer 1). Only verify a session for gated paths.
  if (gateDecision(path, false) === 'notfound') {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    let hasSession = false;
    try {
      hasSession = (await verifySession(token)) !== null;
    } catch {
      hasSession = false;
    }
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = '/blackhole';
      return NextResponse.rewrite(url);
    }
  }

  // 2. Rate limiting (existing behavior + the login rule).
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
    return new NextResponse(JSON.stringify({ ok: false, error: 'rate_limited' }), {
      status: 429,
      headers,
    });
  }

  const res = NextResponse.next();
  headers.forEach((value, name) => res.headers.set(name, value));
  return res;
}

export const config = {
  matcher: ['/api/:path*', '/admin', '/admin/:path*'],
};
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/app/blackhole/page.tsx src/app/not-found.tsx
git commit -m "feat(auth): middleware 404-gates /admin + /api/admin without a session"
```

---

## Task 8: Login route

**Files:**
- Create: `src/app/api/admin/login/route.ts`
- Test: `src/app/api/admin/login/route.test.ts`

- [ ] **Step 1: Write the failing test**

`src/app/api/admin/login/route.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { hashPassword } from '@/lib/auth/password';
import { POST } from './route';

const USERNAME = 'adnan';
const PASSWORD = 'a-long-correct-passphrase';

beforeAll(() => {
  process.env.ADMIN_USERNAME = USERNAME;
  process.env.ADMIN_PASSWORD_HASH = hashPassword(PASSWORD);
  process.env.SESSION_SECRET = 'test-session-secret-long-enough-xxxx';
});

function req(body: unknown, ip: string) {
  return new Request('http://localhost/api/admin/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'http://localhost',
      'host': 'localhost',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/login', () => {
  it('sets a session cookie on correct credentials', async () => {
    const res = await POST(req({ username: USERNAME, password: PASSWORD }, '10.0.0.1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toContain('vr_session=');
  });

  it('rejects a wrong password with 401', async () => {
    const res = await POST(req({ username: USERNAME, password: 'nope' }, '10.0.0.2'));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong username with 401', async () => {
    const res = await POST(req({ username: 'mallory', password: PASSWORD }, '10.0.0.3'));
    expect(res.status).toBe(401);
  });

  it('rejects a cross-origin request with 403', async () => {
    const bad = new Request('http://localhost/api/admin/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': 'http://evil.example',
        'host': 'localhost',
        'x-forwarded-for': '10.0.0.4',
      },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    const res = await POST(bad);
    expect(res.status).toBe(403);
  });

  it('rate-limits repeated attempts with 429', async () => {
    let last = 200;
    for (let i = 0; i < 12; i++) {
      const res = await POST(req({ username: USERNAME, password: 'wrong' }, '10.0.0.99'));
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/app/api/admin/login/route.test.ts`
Expected: FAIL — cannot find `./route`.

- [ ] **Step 3: Implement `src/app/api/admin/login/route.ts`**

```ts
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
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/app/api/admin/login/route.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/login/route.ts src/app/api/admin/login/route.test.ts
git commit -m "feat(auth): login route — scrypt verify, origin check, rate limit, session cookie"
```

---

## Task 9: Logout route

**Files:**
- Create: `src/app/api/admin/logout/route.ts`

- [ ] **Step 1: Implement `src/app/api/admin/logout/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { clearedSessionCookie } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearedSessionCookie());
  return res;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/logout/route.ts
git commit -m "feat(auth): logout route clears the session cookie"
```

---

## Task 10: Login page at the secret path

**Files:**
- Create: `src/app/relay/page.tsx`
- Create: `src/app/relay/login-form.tsx`

> Note: the route folder is named `relay` to match the default `loginPath`. If you change `ADMIN_LOGIN_PATH`, rename this folder to match.

- [ ] **Step 1: Create the client form `src/app/relay/login-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      router.push('/admin');
      return;
    }
    setBusy(false);
    setError(res.status === 429 ? 'too many attempts — wait a few minutes' : 'denied');
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[262px]">
      <div className="text-center font-mono text-[9px] tracking-[0.3em] uppercase text-white/30 mb-6">
        restricted
      </div>
      <label className="block mb-4">
        <span className="block font-mono text-[8.5px] tracking-[0.22em] uppercase text-white/30 mb-1">
          username
        </span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="w-full bg-transparent border-b border-white/15 pb-1.5 font-mono text-sm text-white outline-none focus:border-white/40"
        />
      </label>
      <label className="block mb-5">
        <span className="block font-mono text-[8.5px] tracking-[0.22em] uppercase text-white/30 mb-1">
          password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full bg-transparent border-b border-white/15 pb-1.5 font-mono text-sm text-white outline-none focus:border-white/40"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full border border-white/15 py-2.5 font-mono text-[10.5px] tracking-[0.18em] uppercase text-white hover:border-white/60 transition-colors disabled:opacity-40"
      >
        {busy ? 'enter..' : 'enter ▸'}
      </button>
      {error && (
        <div className="mt-4 text-center font-mono text-[9px] tracking-[0.16em] uppercase text-white/30">
          {error}
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Create the page `src/app/relay/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

// Keep the panel out of search indexes.
export const metadata: Metadata = { title: 'VLG.FM', robots: { index: false, follow: false } };

export default function RelayPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-5 page-enter">
      <LoginForm />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: builds; `/relay` compiles.

- [ ] **Step 4: Commit**

```bash
git add src/app/relay/page.tsx src/app/relay/login-form.tsx
git commit -m "feat(auth): login page at the secret /relay path"
```

---

## Task 11: Gated admin placeholder

**Files:**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/broadcast/page.tsx`

- [ ] **Step 1: Create `src/app/admin/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guard';

export default async function AdminIndex() {
  await requireAdmin();
  redirect('/admin/broadcast');
}
```

- [ ] **Step 2: Create `src/app/admin/broadcast/page.tsx`**

```tsx
import { requireAdmin } from '@/lib/auth/guard';

export default async function AdminBroadcast() {
  await requireAdmin();
  return (
    <div className="px-6 pt-8 page-enter">
      <p className="font-mono text-[0.7rem] tracking-[0.18em] uppercase text-white/70">Broadcast</p>
      <p className="mt-3 font-mono text-[0.65rem] tracking-[0.14em] uppercase text-white/30">
        console — Phase 2
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `npx tsc --noEmit && npm run build`
Expected: builds.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/broadcast/page.tsx
git commit -m "feat(admin): gated broadcast placeholder proving the auth gate"
```

---

## Task 12: Soot-sprite hidden entry

**Files:**
- Create: `src/components/SootSprite.tsx`
- Modify: `src/app/layout.tsx`
- Asset: `public/icons/soot-sprite.png` (add the real transparent PNG)

- [ ] **Step 1: Add the asset**

Drop the team's transparent soot-sprite PNG at `public/icons/soot-sprite.png`. Until then the
component still renders (broken-image box), so the build is unaffected.

- [ ] **Step 2: Create `src/components/SootSprite.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Konami code. The sprite is obscurity only — the real lock is the login behind it.
const SEQUENCE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
];
const LOGIN_PATH = '/relay';
const AUTO_HIDE_MS = 15_000;

export function SootSprite() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let pos = 0;
    function onKey(e: KeyboardEvent) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = key === SEQUENCE[pos] ? pos + 1 : key === SEQUENCE[0] ? 1 : 0;
      if (pos === SEQUENCE.length) {
        pos = 0;
        setVisible(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <button
      aria-label="enter"
      onClick={() => router.push(LOGIN_PATH)}
      className="soot-sprite fixed top-3 left-[88px] z-[60] h-7 w-7 cursor-pointer bg-transparent border-0 p-0"
      style={{
        // subtle white outline tracing the PNG's alpha + gentle bob
        filter:
          'drop-shadow(0 0 0.5px rgba(232,228,217,.55)) drop-shadow(0 0 2px rgba(232,228,217,.18))',
        animation: 'soot-bob 2.6s ease-in-out infinite',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/soot-sprite.png" alt="" className="h-full w-full object-contain" />
      <style>{`
        @keyframes soot-bob {
          0%,100% { transform: translateY(0) rotate(-1.5deg); }
          50%     { transform: translateY(-3px) rotate(1.5deg); }
        }
      `}</style>
    </button>
  );
}
```

> The `left-[88px]` offset places the sprite just right of the logo; tune once the real Nav
> width is confirmed. Outline opacity is deliberately low per the approved design.

- [ ] **Step 3: Mount it in `src/app/layout.tsx`**

Add the import near the other component imports:
```tsx
import { SootSprite } from '@/components/SootSprite';
```
Render it once inside the root layout's body wrapper (alongside `<Nav>` — place it as a sibling so it's available on every page):
```tsx
<SootSprite />
```

- [ ] **Step 4: Build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: builds.

- [ ] **Step 5: Commit**

```bash
git add src/components/SootSprite.tsx src/app/layout.tsx public/icons/soot-sprite.png
git commit -m "feat(admin): soot-sprite hidden entry (konami sequence → login)"
```

---

## Task 13: Deploy wiring + Secret Manager + local env

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `.env.local` (local only — gitignored)

- [ ] **Step 1: Create the GCP secrets (run once; you own GCP)**

```bash
# Generate the password hash locally first:
node scripts/hash-password.mjs 'choose-a-long-passphrase'

# Create secrets (replace PROJECT and values):
printf 'adnan' | gcloud secrets create ADMIN_USERNAME --data-file=- --project PROJECT
printf 'scrypt$...the hash...' | gcloud secrets create ADMIN_PASSWORD_HASH --data-file=- --project PROJECT
openssl rand -base64 48 | tr -d '\n' | gcloud secrets create SESSION_SECRET --data-file=- --project PROJECT

# Let the Cloud Run runtime SA read them:
for S in ADMIN_USERNAME ADMIN_PASSWORD_HASH SESSION_SECRET; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member "serviceAccount:RUNTIME_SA_EMAIL" \
    --role roles/secretmanager.secretAccessor --project PROJECT
done
```

- [ ] **Step 2: Inject secrets in `.github/workflows/deploy.yml`**

In the `gcloud run deploy` command, add a `--set-secrets` flag (keep the existing
`--set-env-vars` line):
```yaml
            --set-env-vars "TRANSMISSIONS_BUCKET=${{ vars.GCP_TRANSMISSIONS_BUCKET }}" \
            --set-secrets "ADMIN_USERNAME=ADMIN_USERNAME:latest,ADMIN_PASSWORD_HASH=ADMIN_PASSWORD_HASH:latest,SESSION_SECRET=SESSION_SECRET:latest" \
```

- [ ] **Step 3: Add local dev vars to `.env.local`**

```bash
ADMIN_USERNAME=adnan
ADMIN_PASSWORD_HASH=<paste output of: node scripts/hash-password.mjs 'dev-pass'>
SESSION_SECRET=<paste output of: openssl rand -base64 48>
# Optional: ADMIN_LOGIN_PATH=/relay
```

- [ ] **Step 4: Verify lint of the workflow edit**

Run: `npm run lint`
Expected: no errors (YAML isn't linted, but confirm nothing else broke).

- [ ] **Step 5: Commit (workflow only — never commit `.env.local`)**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: inject admin auth secrets into Cloud Run via Secret Manager"
```

---

## Task 14: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full check suite**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 2: Start dev and verify the gate (with `.env.local` set)**

Run: `npm run dev`, then:
- Visit `http://localhost:3000/admin/broadcast` → **404** (styled not-found), not the placeholder.
- Visit `http://localhost:3000/relay` → login form renders.
- Submit wrong password → "denied"; submit correct creds → redirected to `/admin/broadcast` placeholder.
- With a session, revisit `/admin/broadcast` → placeholder renders.
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/admin` (no cookie) → `404`.

- [ ] **Step 3: Verify the sprite**

On any public page, type the Konami sequence (`↑↑↓↓←→←→ b a`) → soot sprite appears by the
logo, bobbing, with the subtle outline; wait 15s → it disappears; re-summon → click → login.

- [ ] **Step 4: Verify logout**

From a logged-in state, `POST /api/admin/logout` (or a temporary button) → cookie cleared →
`/admin/broadcast` returns 404 again.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git commit -am "chore(auth): phase 0 verification fixes" || echo "nothing to commit"
```

---

## Self-review notes (coverage vs spec §5 / §11 Phase 0)

- **Hidden entry** → Task 12 (sprite + sequence + 15s hide), login at `/relay` Task 10.
- **404 gate, defense in depth** → Task 7 (middleware) + Task 6/11 (`requireAdmin` per route).
- **Argon2id/slow hash** → Task 3 (scrypt substitution, flagged in Decisions).
- **Secret Manager, no plaintext** → Task 13.
- **Stateless signed cookie (httpOnly/Secure/SameSite=Strict), Cloud Run multi-instance** → Task 4.
- **Rate-limited login** → Task 7 (middleware rule) + Task 8 (in-route, tested).
- **CSRF (origin check)** → Task 8 (`sameOrigin`); SameSite=Strict cookie Task 4. Double-submit
  token deferred to authenticated mutations in later phases (no admin mutations exist yet).
- **noindex admin** → Task 10 metadata; broaden in Phase 6 hardening.

Out of scope for Phase 0 (later phases): content store, uploads, signed URLs, CSP headers,
audit logging, AGENTS.md drift fix (Phase 6).
