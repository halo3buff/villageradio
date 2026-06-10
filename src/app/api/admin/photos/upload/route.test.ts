import { describe, it, expect, beforeEach, vi } from 'vitest';

const { putImage, requireAdmin } = vi.hoisted(() => ({ putImage: vi.fn(), requireAdmin: vi.fn() }));
vi.mock('@/lib/storage/r2', () => ({ putImage }));
vi.mock('@/lib/auth/guard', () => ({ requireAdmin }));

import { POST } from './route';

// Magic bytes for each accepted type, padded out.
function jpeg(len = 64): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(len);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
}
function png(len = 64): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(len);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b;
}
function webp(len = 64): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(len);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  return b;
}
function mp3(len = 64): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(len);
  b.set([0xff, 0xfb, 0x90, 0x00]);
  return b;
}

const SAME = { origin: 'https://vlgfm.live', host: 'vlgfm.live' };

function form(bytes: Uint8Array<ArrayBuffer>, type = 'image/jpeg', filename = 'My Photo.jpg'): FormData {
  const f = new FormData();
  f.append('image', new Blob([bytes], { type }), filename);
  f.append('filename', filename);
  return f;
}
function req(body: FormData, headers: Record<string, string> = SAME): Request {
  return new Request('https://vlgfm.live/api/admin/photos/upload', { method: 'POST', headers, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
  putImage.mockResolvedValue('photos/my_photo.jpg');
});

describe('POST /api/admin/photos/upload', () => {
  it('sniffs a JPEG, uploads under photos/, and returns the stored key', async () => {
    const res = await POST(req(form(jpeg())));
    expect(res.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalled();
    const [key, , type] = putImage.mock.calls[0];
    expect(key).toBe('photos/my_photo.jpg');
    expect(type).toBe('image/jpeg');
    expect(await res.json()).toEqual({ ok: true, key: 'photos/my_photo.jpg' });
  });

  it('accepts PNG and WEBP', async () => {
    expect((await POST(req(form(png(), 'image/png', 'a.png')))).status).toBe(200);
    expect((await POST(req(form(webp(), 'image/webp', 'b.webp')))).status).toBe(200);
  });

  it('reflects the collision-suffixed key R2 actually stored', async () => {
    putImage.mockResolvedValue('photos/my_photo-1a2b3c4d.jpg');
    expect((await (await POST(req(form(jpeg())))).json()).key).toBe('photos/my_photo-1a2b3c4d.jpg');
  });

  it('rejects a disallowed declared content type', async () => {
    const res = await POST(req(form(jpeg(), 'image/gif')));
    expect(res.status).toBe(400);
    expect(putImage).not.toHaveBeenCalled();
  });

  it('rejects bytes that are not actually an image (mp3 with a spoofed image type)', async () => {
    const res = await POST(req(form(mp3(), 'image/jpeg')));
    expect(res.status).toBe(400);
    expect(putImage).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    const res = await POST(req(form(new Uint8Array(0))));
    expect(res.status).toBe(400);
    expect(putImage).not.toHaveBeenCalled();
  });

  it('rejects a file over the size cap', async () => {
    const res = await POST(req(form(jpeg(10_485_760 + 1))));
    expect(res.status).toBe(400);
    expect(putImage).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin request', async () => {
    const res = await POST(req(form(jpeg()), { origin: 'https://evil.example', host: 'vlgfm.live' }));
    expect(res.status).toBe(403);
    expect(putImage).not.toHaveBeenCalled();
  });

  it('rejects a request with no image part', async () => {
    const f = new FormData();
    f.append('filename', 'x.jpg');
    expect((await POST(req(f))).status).toBe(400);
  });

  it('runs the auth guard first', async () => {
    requireAdmin.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(POST(req(form(jpeg())))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(putImage).not.toHaveBeenCalled();
  });
});
