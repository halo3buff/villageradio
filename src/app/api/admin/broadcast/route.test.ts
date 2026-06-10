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
import { SEED_BROADCAST } from '@/lib/content/seed';

const manifest = {
  version: 1,
  entries: [
    { id: 'a', title: 'A', artist: 'V', date: '06-28-2025', durationSec: 100, file: 'a.mp3', kind: 'mix', series: 'red', tags: [] },
  ],
};

const SAME = { origin: 'https://vlgfm.live', host: 'vlgfm.live' };

function putReq(body: unknown, headers: Record<string, string> = SAME): Request {
  return new Request('https://vlgfm.live/api/admin/broadcast', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
});

describe('GET /api/admin/broadcast', () => {
  it('returns the live manifest and its generation', async () => {
    readManifest.mockResolvedValue({ data: manifest, generation: '7' });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual({ manifest, generation: '7' });
  });

  it('falls back to the seed with generation "0" when the object is absent', async () => {
    readManifest.mockResolvedValue(null);
    const res = await GET();
    const body = await res.json();
    expect(body.generation).toBe('0');
    expect(body.manifest).toEqual(SEED_BROADCAST);
  });
});

describe('PUT /api/admin/broadcast', () => {
  it('writes with the loaded generation, publishes, and returns the new generation', async () => {
    writeManifest.mockResolvedValue(undefined);
    readManifest.mockResolvedValue({ data: manifest, generation: '8' }); // post-write re-read
    const res = await PUT(putReq({ manifest, generation: '7' }));
    expect(res.status).toBe(200);
    expect(writeManifest).toHaveBeenCalledWith('broadcast.json', manifest, { ifGenerationMatch: '7' });
    expect(publishManifest).toHaveBeenCalledWith('broadcast');
    expect((await res.json()).generation).toBe('8');
  });

  it('passes ifGenerationMatch "0" on a first-ever write', async () => {
    writeManifest.mockResolvedValue(undefined);
    readManifest.mockResolvedValue({ data: manifest, generation: '1' });
    await PUT(putReq({ manifest, generation: '0' }));
    expect(writeManifest).toHaveBeenCalledWith('broadcast.json', manifest, { ifGenerationMatch: '0' });
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

  it('rejects an invalid manifest with 400 and does not write', async () => {
    const bad = { version: 1, entries: [{ id: 'a', title: 'A', artist: 'V', date: '', durationSec: 1, file: '../escape.mp3', kind: 'mix', tags: [] }] };
    const res = await PUT(putReq({ manifest: bad, generation: '7' }));
    expect(res.status).toBe(400);
    expect(writeManifest).not.toHaveBeenCalled();
  });

  it('rejects a body missing the generation with 400', async () => {
    const res = await PUT(putReq({ manifest }));
    expect(res.status).toBe(400);
    expect(writeManifest).not.toHaveBeenCalled();
  });

  it('rejects an unparseable body with 400', async () => {
    const res = await PUT(putReq('not json'));
    expect(res.status).toBe(400);
  });

  it('runs the auth guard before doing anything', async () => {
    requireAdmin.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(PUT(putReq({ manifest, generation: '7' }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(writeManifest).not.toHaveBeenCalled();
  });
});
