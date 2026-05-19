import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const BLOB_BASE = 'https://sqpxujl59eeeqlyt.private.blob.vercel-storage.com/mixes_inters';

const ALLOWED = new Set([
  'inter_1.mp3',
  'inter_2.mp3',
  'inter_3.mp3',
  'inter_4.mp3',
  'mix_evening_1.mp3',
  'mix_midnight_1.wav',
  'mix_midnight_3.mp3',
  'mix_morning_1.wav',
  'mix_morning_2.wav',
]);

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');

  if (!file || !ALLOWED.has(file)) {
    return new Response('Not found', { status: 404 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return new Response('Server misconfigured', { status: 500 });
  }

  const fetchHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  const range = request.headers.get('Range');
  if (range) fetchHeaders['Range'] = range;

  const upstream = await fetch(`${BLOB_BASE}/${file}`, { headers: fetchHeaders });

  if (!upstream.ok) {
    return new Response('Upstream error', { status: upstream.status });
  }

  const resHeaders = new Headers();
  for (const key of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const val = upstream.headers.get(key);
    if (val) resHeaders.set(key, val);
  }

  // Ensure the browser treats the response as audio, regardless of what the blob store sends
  if (!resHeaders.has('Content-Type')) {
    const ext = file.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4' };
    if (ext && mimeMap[ext]) resHeaders.set('Content-Type', mimeMap[ext]);
  }

  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}
