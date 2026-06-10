import { NextResponse } from 'next/server';
import { clearedSessionCookie } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearedSessionCookie());
  return res;
}
