import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { getBroadcastFiles } = vi.hoisted(() => ({ getBroadcastFiles: vi.fn() }));
vi.mock('@/lib/content/loaders', () => ({ getBroadcastFiles }));
vi.mock('@/lib/content/media', () => ({ R2_PUBLIC_BASE: 'https://r2.example' }));

import { GET } from './route';

const MB = 1024 * 1024;

function req(range?: string): NextRequest {
  const headers = new Headers(range ? { Range: range } : {});
  return {
    nextUrl: new URL('https://vlgfm.live/api/audio/stream?file=big.mp3'),
    headers,
  } as unknown as NextRequest;
}

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
  getBroadcastFiles.mockResolvedValue(['big.mp3']);
  fetchMock.mockResolvedValue(new Response('x', { status: 206 }));
});

/** The Range header the proxy sent upstream on its last fetch. */
function upstreamRange(): string {
  return fetchMock.mock.calls[0][1].headers.Range;
}

// Cloud Run 500s fixed-length responses over 32 MB, so the proxy must never
// forward an unbounded (or over-wide) range upstream.
describe('GET /api/audio/stream range bounding', () => {
  it('bounds an open-ended range to the 16 MB window', async () => {
    await GET(req('bytes=0-'));
    expect(upstreamRange()).toBe(`bytes=0-${16 * MB - 1}`);
  });

  it('bounds a mid-file open-ended range from its start', async () => {
    await GET(req('bytes=40000000-'));
    expect(upstreamRange()).toBe(`bytes=40000000-${40000000 + 16 * MB - 1}`);
  });

  it('passes a small explicit range through unchanged', async () => {
    await GET(req('bytes=100-200'));
    expect(upstreamRange()).toBe('bytes=100-200');
  });

  it('caps an explicit range wider than the window', async () => {
    await GET(req(`bytes=0-${64 * MB}`));
    expect(upstreamRange()).toBe(`bytes=0-${16 * MB - 1}`);
  });

  it('treats a missing Range header as bytes=0- (bounded)', async () => {
    await GET(req());
    expect(upstreamRange()).toBe(`bytes=0-${16 * MB - 1}`);
  });

  it('still 404s files outside the manifest allowlist', async () => {
    getBroadcastFiles.mockResolvedValue(['other.mp3']);
    const res = await GET(req('bytes=0-'));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
