import type { NextRequest } from 'next/server';
import { getBroadcastFiles } from '@/lib/content/loaders';

export const runtime = 'nodejs';

const R2_BASE = 'https://pub-fa76dac35d0c4ddf9a81d5267a06b241.r2.dev';

// Allowlist derived from the broadcast manifest (GCS config bucket, cached) — the single
// source of truth. Audio bytes still come from R2; only the lineup is now editable.
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
};

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');
  const allowed = new Set(await getBroadcastFiles());
  if (!file || !allowed.has(file)) return new Response('Not found', { status: 404 });

  const fetchHeaders: Record<string, string> = {};
  const range = request.headers.get('Range');
  if (range) fetchHeaders['Range'] = range;

  const upstream = await fetch(`${R2_BASE}/${file}`, { headers: fetchHeaders });
  if (!upstream.ok) return new Response('Upstream error', { status: upstream.status });

  const resHeaders = new Headers();
  for (const key of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const val = upstream.headers.get(key);
    if (val) resHeaders.set(key, val);
  }

  if (!resHeaders.has('Content-Type')) {
    const ext = file.split('.').pop()?.toLowerCase();
    if (ext && MIME[ext]) resHeaders.set('Content-Type', MIME[ext]);
  }

  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}
