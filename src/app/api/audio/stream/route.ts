import type { NextRequest } from 'next/server';
import { getBroadcastFiles } from '@/lib/content/loaders';
import { R2_PUBLIC_BASE } from '@/lib/content/media';

export const runtime = 'nodejs';

// Allowlist derived from the broadcast manifest (GCS config bucket, cached) — the single
// source of truth. Audio bytes still come from R2; only the lineup is now editable.
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
};

// Cloud Run kills fixed-length responses over 32 MB (Google Frontend returns a bare 500),
// so an open-ended `Range: bytes=0-` on a long mix dies. Always serve a bounded window —
// the 206 + Content-Range tells the browser there's more and it issues follow-up ranges.
const WINDOW_BYTES = 16 * 1024 * 1024;

/** Client Range header (or null) → bounded upstream Range value. */
function boundRange(header: string | null): string {
  const m = /^bytes=(\d+)-(\d*)$/.exec(header ?? '');
  const start = m ? Number(m[1]) : 0;
  const cap = start + WINDOW_BYTES - 1;
  const end = m?.[2] ? Math.min(Number(m[2]), cap) : cap;
  return `bytes=${start}-${end}`;
}

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');
  const allowed = new Set(await getBroadcastFiles());
  if (!file || !allowed.has(file)) return new Response('Not found', { status: 404 });

  const fetchHeaders: Record<string, string> = {
    Range: boundRange(request.headers.get('Range')),
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${R2_PUBLIC_BASE}/${file}`, { headers: fetchHeaders });
  } catch (err) {
    console.error(`[audio-stream] upstream fetch failed for ${file}`, err);
    return new Response('Upstream error', { status: 502 });
  }
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
