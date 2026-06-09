import { describe, it, expect, beforeEach, vi } from 'vitest';

const { file, bucket } = vi.hoisted(() => {
  const file = { download: vi.fn(), getMetadata: vi.fn(), save: vi.fn() };
  const bucket = { file: vi.fn(() => file) };
  return { file, bucket };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(() => ({ bucket: () => bucket })),
}));

import { readManifest, writeManifest, ConflictError } from './store';

beforeEach(() => {
  process.env.CONFIG_BUCKET = 'test-config-bucket';
  file.download.mockReset();
  file.getMetadata.mockReset();
  file.save.mockReset();
  bucket.file.mockClear();
});

describe('readManifest', () => {
  it('parses JSON and returns the generation', async () => {
    file.download.mockResolvedValue([Buffer.from('{"version":1,"entries":[]}')]);
    file.getMetadata.mockResolvedValue([{ generation: '7' }]);
    const res = await readManifest('broadcast.json');
    expect(res).toEqual({ data: { version: 1, entries: [] }, generation: '7' });
    expect(bucket.file).toHaveBeenCalledWith('content/broadcast.json');
  });

  it('returns null when the object is missing (404)', async () => {
    file.download.mockRejectedValue(Object.assign(new Error('No such object'), { code: 404 }));
    expect(await readManifest('broadcast.json')).toBeNull();
  });

  it('rethrows non-404 errors', async () => {
    file.download.mockRejectedValue(Object.assign(new Error('boom'), { code: 500 }));
    await expect(readManifest('broadcast.json')).rejects.toThrow('boom');
  });
});

describe('writeManifest', () => {
  it('forwards ifGenerationMatch to save', async () => {
    file.save.mockResolvedValue(undefined);
    await writeManifest('broadcast.json', { version: 1 }, { ifGenerationMatch: '7' });
    expect(file.save).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ preconditionOpts: { ifGenerationMatch: 7 } }),
    );
  });

  it('throws ConflictError on a 412 precondition failure', async () => {
    file.save.mockRejectedValue(Object.assign(new Error('precondition'), { code: 412 }));
    await expect(
      writeManifest('broadcast.json', {}, { ifGenerationMatch: '1' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
