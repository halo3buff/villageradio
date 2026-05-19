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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  if (!ALLOWED.has(filename)) {
    return new Response('Not found', { status: 404 });
  }

  const fetchHeaders: HeadersInit = {
    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  };

  const range = request.headers.get('Range');
  if (range) fetchHeaders['Range'] = range;

  const upstream = await fetch(`${BLOB_BASE}/${filename}`, { headers: fetchHeaders });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response('Upstream error', { status: upstream.status });
  }

  const resHeaders = new Headers();
  for (const key of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const val = upstream.headers.get(key);
    if (val) resHeaders.set(key, val);
  }

  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}
