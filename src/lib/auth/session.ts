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
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body) as BufferSource));
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
    ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig) as BufferSource, enc.encode(body) as BufferSource);
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
