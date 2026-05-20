import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const R2_BASE   = 'https://pub-fa76dac35d0c4ddf9a81d5267a06b241.r2.dev';
const BLOB_BASE = 'https://sqpxujl59eeeqlyt.private.blob.vercel-storage.com/mixes_inter';

// R2 files (color-based broadcast system)
const R2_FILES = new Set([
  'green_04-08-2026.mp3',
  'green_04-10-2026.mp3',
  'green_05-19-2026.mp3',
  'green_05-20-2026.mp3',
  'yellow_02-01-2026.mp3',
  'red_01-15-2026.mp3',
  'red_05-20-2026.mp3',
  'red_06-28-2025.mp3',
  'inter_1.mp3',
  'inter_2.mp3',
  'inter_3.mp3',
  'inter_4.mp3',
  'inter_5.mp3',
]);

// Legacy Vercel Blob files
const BLOB_FILES = new Set([
  'mix_evening_1.mp3',
  'mix_midnight_1.wav',
  'mix_midnight_3.mp3',
  'mix_morning_1.wav',
  'mix_morning_2.wav',
]);

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
};

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');
  if (!file) return new Response('Not found', { status: 404 });

  const fetchHeaders: Record<string, string> = {};
  const range = request.headers.get('Range');
  if (range) fetchHeaders['Range'] = range;

  let upstreamUrl: string;

  if (R2_FILES.has(file)) {
    upstreamUrl = `${R2_BASE}/${file}`;
  } else if (BLOB_FILES.has(file)) {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return new Response('Server misconfigured', { status: 500 });
    fetchHeaders['Authorization'] = `Bearer ${token}`;
    upstreamUrl = `${BLOB_BASE}/${file}`;
  } else {
    return new Response('Not found', { status: 404 });
  }

  const upstream = await fetch(upstreamUrl, { headers: fetchHeaders });
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
