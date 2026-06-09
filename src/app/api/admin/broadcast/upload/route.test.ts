import { describe, it, expect, beforeEach, vi } from 'vitest';

const { putAudio, requireAdmin } = vi.hoisted(() => ({ putAudio: vi.fn(), requireAdmin: vi.fn() }));
vi.mock('@/lib/storage/r2', () => ({ putAudio }));
vi.mock('@/lib/auth/guard', () => ({ requireAdmin }));

import { POST } from './route';

// Valid MPEG1 Layer III frame header (128 kbps, 44100 Hz, stereo) + padding zeros.
function mp3Bytes(len: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(len);
  b.set([0xff, 0xfb, 0x90, 0x00]);
  return b;
}

const SAME = { origin: 'https://vlgfm.live', host: 'vlgfm.live' };

function form(bytes: Uint8Array<ArrayBuffer>, type = 'audio/mpeg', filename = 'green_test.mp3'): FormData {
  const f = new FormData();
  f.append('audio', new Blob([bytes], { type }), filename);
  f.append('filename', filename);
  return f;
}
function req(body: FormData, headers: Record<string, string> = SAME): Request {
  return new Request('https://vlgfm.live/api/admin/broadcast/upload', { method: 'POST', headers, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
  putAudio.mockResolvedValue('green_test.mp3');
});

describe('POST /api/admin/broadcast/upload', () => {
  it('probes the duration, uploads to R2, and returns the stored file', async () => {
    const res = await POST(req(form(mp3Bytes(32000)))); // 32000 / 16000 B/s = 2 s
    expect(res.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalled();
    expect(putAudio).toHaveBeenCalledWith('green_test.mp3', expect.any(Buffer), 'audio/mpeg');
    expect(await res.json()).toEqual({ ok: true, file: 'green_test.mp3', durationSec: 2 });
  });

  it('reflects the collision-suffixed key R2 actually stored', async () => {
    putAudio.mockResolvedValue('green_test-1a2b3c4d.mp3');
    const body = await (await POST(req(form(mp3Bytes(32000))))).json();
    expect(body.file).toBe('green_test-1a2b3c4d.mp3');
  });

  it('rejects a non-mpeg content type', async () => {
    const res = await POST(req(form(mp3Bytes(32000), 'audio/webm')));
    expect(res.status).toBe(400);
    expect(putAudio).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    const res = await POST(req(form(new Uint8Array(0))));
    expect(res.status).toBe(400);
    expect(putAudio).not.toHaveBeenCalled();
  });

  it('rejects a file over the size cap', async () => {
    const res = await POST(req(form(mp3Bytes(12_582_912 + 1))));
    expect(res.status).toBe(400);
    expect(putAudio).not.toHaveBeenCalled();
  });

  it('rejects bytes that are not actually an MP3 (no frame sync)', async () => {
    const res = await POST(req(form(new Uint8Array(2000)))); // declared audio/mpeg, but all zeros
    expect(res.status).toBe(400);
    expect(putAudio).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin request', async () => {
    const res = await POST(req(form(mp3Bytes(32000)), { origin: 'https://evil.example', host: 'vlgfm.live' }));
    expect(res.status).toBe(403);
    expect(putAudio).not.toHaveBeenCalled();
  });

  it('rejects a request with no audio part', async () => {
    const f = new FormData();
    f.append('filename', 'x.mp3');
    const res = await POST(req(f));
    expect(res.status).toBe(400);
  });

  it('runs the auth guard first', async () => {
    requireAdmin.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(POST(req(form(mp3Bytes(32000))))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(putAudio).not.toHaveBeenCalled();
  });
});
