import { describe, it, expect, beforeEach, vi } from 'vitest';

const { readManifest, writeManifest, publishManifest, requireAdmin, ConflictError } = vi.hoisted(() => {
  class ConflictError extends Error {
    constructor(message = 'conflict') {
      super(message);
      this.name = 'ConflictError';
    }
  }
  return {
    readManifest: vi.fn(),
    writeManifest: vi.fn(),
    publishManifest: vi.fn(),
    requireAdmin: vi.fn(),
    ConflictError,
  };
});

vi.mock('@/lib/content/store', () => ({ readManifest, writeManifest, ConflictError }));
vi.mock('@/lib/content/loaders', () => ({ publishManifest }));
vi.mock('@/lib/auth/guard', () => ({ requireAdmin }));

import { GET, PUT } from './route';
import { SEED_PHOTOS } from '@/lib/content/seed';

const manifest = { version: 1, photos: [{ id: 'a', key: 'photos/a.jpg', order: 0 }] };

const SAME = { origin: 'https://vlgfm.live', host: 'vlgfm.live' };

function putReq(body: unknown, headers: Record<string, string> = SAME): Request {
  return new Request('https://vlgfm.live/api/admin/photos', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
});

describe('GET /api/admin/photos', () => {
  it('returns the live manifest and its generation', async () => {
    readManifest.mockResolvedValue({ data: manifest, generation: '7' });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalled();
    expect(await res.json()).toEqual({ manifest, generation: '7' });
  });

  it('falls back to the seed with generation "0" when absent', async () => {
    readManifest.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body.generation).toBe('0');
    expect(body.manifest).toEqual(SEED_PHOTOS);
  });
});

describe('PUT /api/admin/photos', () => {
  it('writes with the loaded generation, publishes, and returns the new generation', async () => {
    writeManifest.mockResolvedValue(undefined);
    readManifest.mockResolvedValue({ data: manifest, generation: '8' });
    const res = await PUT(putReq({ manifest, generation: '7' }));
    expect(res.status).toBe(200);
    expect(writeManifest).toHaveBeenCalledWith('photos.json', manifest, { ifGenerationMatch: '7' });
    expect(publishManifest).toHaveBeenCalledWith('photos');
    expect((await res.json()).generation).toBe('8');
  });

  it('maps a write conflict to 409', async () => {
    writeManifest.mockRejectedValue(new ConflictError());
    const res = await PUT(putReq({ manifest, generation: '7' }));
    expect(res.status).toBe(409);
    expect(publishManifest).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin request with 403 and does not write', async () => {
    const res = await PUT(putReq({ manifest, generation: '7' }, { origin: 'https://evil.example', host: 'vlgfm.live' }));
    expect(res.status).toBe(403);
    expect(writeManifest).not.toHaveBeenCalled();
  });

  it('rejects an invalid manifest (unsafe key) with 400 and does not write', async () => {
    const bad = { version: 1, photos: [{ id: 'a', key: 'photos/../escape.jpg', order: 0 }] };
    const res = await PUT(putReq({ manifest: bad, generation: '7' }));
    expect(res.status).toBe(400);
    expect(writeManifest).not.toHaveBeenCalled();
  });

  it('rejects a body missing the generation with 400', async () => {
    const res = await PUT(putReq({ manifest }));
    expect(res.status).toBe(400);
    expect(writeManifest).not.toHaveBeenCalled();
  });

  it('runs the auth guard before doing anything', async () => {
    requireAdmin.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(PUT(putReq({ manifest, generation: '7' }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(writeManifest).not.toHaveBeenCalled();
  });
});
