import { describe, it, expect, beforeEach, vi } from 'vitest';

const { readText, writeText, publishManifest, requireAdmin, ConflictError } = vi.hoisted(() => {
  class ConflictError extends Error {
    constructor(message = 'conflict') {
      super(message);
      this.name = 'ConflictError';
    }
  }
  return {
    readText: vi.fn(),
    writeText: vi.fn(),
    publishManifest: vi.fn(),
    requireAdmin: vi.fn(),
    ConflictError,
  };
});

vi.mock('@/lib/content/store', () => ({ readText, writeText, ConflictError }));
vi.mock('@/lib/content/loaders', () => ({ publishManifest }));
vi.mock('@/lib/auth/guard', () => ({ requireAdmin }));

import { GET, PUT } from './route';

const SAME = { origin: 'https://vlgfm.live', host: 'vlgfm.live' };

function putReq(body: unknown, headers: Record<string, string> = SAME): Request {
  return new Request('https://vlgfm.live/api/admin/information', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
});

describe('GET /api/admin/information', () => {
  it('returns the live document and its generation', async () => {
    readText.mockResolvedValue({ text: '# Hello', generation: '7' });
    expect(await (await GET()).json()).toEqual({ text: '# Hello', generation: '7' });
    expect(requireAdmin).toHaveBeenCalled();
  });

  it('falls back to the bundled doc with generation "0" when absent', async () => {
    readText.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body.generation).toBe('0');
    expect(typeof body.text).toBe('string');
    expect(body.text.length).toBeGreaterThan(0);
  });
});

describe('PUT /api/admin/information', () => {
  it('writes with the loaded generation, publishes, and returns the new generation', async () => {
    writeText.mockResolvedValue(undefined);
    readText.mockResolvedValue({ text: '# New', generation: '8' });
    const res = await PUT(putReq({ text: '# New', generation: '7' }));
    expect(res.status).toBe(200);
    expect(writeText).toHaveBeenCalledWith('information.md', '# New', { ifGenerationMatch: '7' });
    expect(publishManifest).toHaveBeenCalledWith('information');
    expect((await res.json()).generation).toBe('8');
  });

  it('maps a write conflict to 409', async () => {
    writeText.mockRejectedValue(new ConflictError());
    expect((await PUT(putReq({ text: 'x', generation: '7' }))).status).toBe(409);
    expect(publishManifest).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin request with 403', async () => {
    const res = await PUT(putReq({ text: 'x', generation: '7' }, { origin: 'https://evil.example', host: 'vlgfm.live' }));
    expect(res.status).toBe(403);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('rejects a missing generation with 400', async () => {
    expect((await PUT(putReq({ text: 'x' }))).status).toBe(400);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('rejects a non-string body text with 400', async () => {
    expect((await PUT(putReq({ text: 42, generation: '7' }))).status).toBe(400);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('rejects an oversized document with 400', async () => {
    const huge = 'a'.repeat(300_000);
    expect((await PUT(putReq({ text: huge, generation: '7' }))).status).toBe(400);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('runs the auth guard before doing anything', async () => {
    requireAdmin.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(PUT(putReq({ text: 'x', generation: '7' }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(writeText).not.toHaveBeenCalled();
  });
});
