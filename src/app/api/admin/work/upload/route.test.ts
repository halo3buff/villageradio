import { describe, it, expect, beforeEach, vi } from 'vitest';

// The full upload logic is covered by photos/upload/route.test.ts (same factory). Here we just
// confirm this route delegates with the `work/` prefix.
const { putImage, requireAdmin } = vi.hoisted(() => ({ putImage: vi.fn(), requireAdmin: vi.fn() }));
vi.mock('@/lib/storage/r2', () => ({ putImage }));
vi.mock('@/lib/auth/guard', () => ({ requireAdmin }));

import { POST } from './route';

function jpeg(): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(64);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
}

const SAME = { origin: 'https://vlgfm.live', host: 'vlgfm.live' };

function req(): Request {
  const f = new FormData();
  f.append('image', new Blob([jpeg()], { type: 'image/jpeg' }), 'cover.jpg');
  f.append('filename', 'cover.jpg');
  return new Request('https://vlgfm.live/api/admin/work/upload', { method: 'POST', headers: SAME, body: f });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
  putImage.mockResolvedValue('work/cover.jpg');
});

describe('POST /api/admin/work/upload', () => {
  it('stores under the work/ prefix and returns the key', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(putImage.mock.calls[0][0]).toBe('work/cover.jpg');
    expect(await res.json()).toEqual({ ok: true, key: 'work/cover.jpg' });
  });
});
