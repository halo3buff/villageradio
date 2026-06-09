import { describe, it, expect, beforeEach, vi } from 'vitest';

const { file, bucket } = vi.hoisted(() => {
  const file = { move: vi.fn(), download: vi.fn() };
  const bucket = { file: vi.fn(() => file), getFiles: vi.fn() };
  return { file, bucket };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(() => ({ bucket: () => bucket })),
}));

import {
  listQueue,
  keepTransmission,
  deleteTransmission,
  downloadTransmission,
  transmissionsBucketName,
} from './store';

function gcsFile(name: string, size: string, timeCreated: string) {
  return { name, metadata: { size, timeCreated } };
}

beforeEach(() => {
  process.env.TRANSMISSIONS_BUCKET = 'test-transmissions';
  file.move.mockReset();
  file.download.mockReset();
  bucket.file.mockClear();
  bucket.getFiles.mockReset();
});

describe('transmissionsBucketName', () => {
  it('throws when the env var is unset', () => {
    delete process.env.TRANSMISSIONS_BUCKET;
    expect(() => transmissionsBucketName()).toThrow();
  });
});

describe('listQueue', () => {
  it('returns only incoming (new/ + bare) objects, newest first, with parsed fields', async () => {
    bucket.getFiles.mockResolvedValue([
      [
        gcsFile('transmissions/new/2026-05-17T22-14-03Z-anon-ab12cd34.webm', '2048', '2026-05-17T22:14:05Z'),
        gcsFile('transmissions/new/2026-05-18T09-00-00Z-dj-cool-ff00ff00.webm', '4096', '2026-05-18T09:00:02Z'),
        gcsFile('transmissions/kept/2026-05-10T10-00-00Z-anon-11111111.webm', '1024', '2026-05-10T10:00:02Z'),
        gcsFile('transmissions/trash/2026-05-09T10-00-00Z-anon-22222222.webm', '1024', '2026-05-09T10:00:02Z'),
        gcsFile('transmissions/legacy.webm', '512', '2026-05-01T00:00:00Z'),
      ],
    ]);

    const items = await listQueue();

    expect(bucket.getFiles).toHaveBeenCalledWith({ prefix: 'transmissions/' });
    expect(items.map((i) => i.name)).toEqual([
      'transmissions/new/2026-05-18T09-00-00Z-dj-cool-ff00ff00.webm',
      'transmissions/new/2026-05-17T22-14-03Z-anon-ab12cd34.webm',
      'transmissions/legacy.webm',
    ]);
    expect(items[1]).toEqual({
      name: 'transmissions/new/2026-05-17T22-14-03Z-anon-ab12cd34.webm',
      handle: 'anon',
      uploadedAt: '2026-05-17T22:14:03Z',
      sizeBytes: 2048,
      state: 'new',
    });
    // Bare object: handle falls back to 'anon', uploadedAt from GCS timeCreated.
    expect(items[2]).toEqual({
      name: 'transmissions/legacy.webm',
      handle: 'anon',
      uploadedAt: '2026-05-01T00:00:00Z',
      sizeBytes: 512,
      state: 'new',
    });
  });

  it('returns an empty array when nothing is uploaded', async () => {
    bucket.getFiles.mockResolvedValue([[]]);
    expect(await listQueue()).toEqual([]);
  });
});

describe('keepTransmission', () => {
  it('moves the object into the kept/ folder', async () => {
    file.move.mockResolvedValue(undefined);
    await keepTransmission('transmissions/new/2026-05-17T22-14-03Z-anon-ab12cd34.webm');
    expect(bucket.file).toHaveBeenCalledWith('transmissions/new/2026-05-17T22-14-03Z-anon-ab12cd34.webm');
    expect(file.move).toHaveBeenCalledWith('transmissions/kept/2026-05-17T22-14-03Z-anon-ab12cd34.webm');
  });

  it('rejects an unsafe name without touching storage', async () => {
    await expect(keepTransmission('transmissions/../x.webm')).rejects.toThrow();
    expect(file.move).not.toHaveBeenCalled();
  });
});

describe('deleteTransmission', () => {
  it('moves the object into the trash/ folder (soft delete)', async () => {
    file.move.mockResolvedValue(undefined);
    await deleteTransmission('transmissions/new/2026-05-17T22-14-03Z-anon-ab12cd34.webm');
    expect(file.move).toHaveBeenCalledWith('transmissions/trash/2026-05-17T22-14-03Z-anon-ab12cd34.webm');
  });

  it('rejects an unsafe name without touching storage', async () => {
    await expect(deleteTransmission('../escape.webm')).rejects.toThrow();
    expect(file.move).not.toHaveBeenCalled();
  });
});

describe('downloadTransmission', () => {
  it('returns the bytes and the webm content type', async () => {
    file.download.mockResolvedValue([Buffer.from('webmbytes')]);
    const res = await downloadTransmission('transmissions/new/2026-05-17T22-14-03Z-anon-ab12cd34.webm');
    expect(res.contentType).toBe('audio/webm');
    expect(res.body.toString()).toBe('webmbytes');
  });

  it('rejects an unsafe name without touching storage', async () => {
    await expect(downloadTransmission('transmissions/new/x.json')).rejects.toThrow();
    expect(file.download).not.toHaveBeenCalled();
  });
});
