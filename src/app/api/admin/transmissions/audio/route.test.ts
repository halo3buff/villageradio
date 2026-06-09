import { describe, it, expect, beforeEach, vi } from 'vitest';

const { downloadTransmission, requireAdmin } = vi.hoisted(() => ({
  downloadTransmission: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/transmissions/store', () => ({ downloadTransmission }));
vi.mock('@/lib/auth/guard', () => ({ requireAdmin }));

import { GET } from './route';

const NAME = 'transmissions/new/2026-05-17T22-14-03Z-anon-ab12cd34.webm';

function getReq(query: string): Request {
  return new Request(`https://vlgfm.live/api/admin/transmissions/audio${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
});

describe('GET /api/admin/transmissions/audio', () => {
  it('streams the object bytes as audio/webm behind the guard', async () => {
    downloadTransmission.mockResolvedValue({ body: Buffer.from('webmbytes'), contentType: 'audio/webm' });
    const res = await GET(getReq(`?name=${encodeURIComponent(NAME)}`));
    expect(res.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalled();
    expect(res.headers.get('Content-Type')).toBe('audio/webm');
    expect(await res.text()).toBe('webmbytes');
    expect(downloadTransmission).toHaveBeenCalledWith(NAME);
  });

  it('rejects a missing name with 400 without reading storage', async () => {
    const res = await GET(getReq(''));
    expect(res.status).toBe(400);
    expect(downloadTransmission).not.toHaveBeenCalled();
  });

  it('rejects an unsafe name with 400 without reading storage', async () => {
    const res = await GET(getReq('?name=transmissions/../secret.webm'));
    expect(res.status).toBe(400);
    expect(downloadTransmission).not.toHaveBeenCalled();
  });

  it('runs the auth guard before doing anything', async () => {
    requireAdmin.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(GET(getReq(`?name=${encodeURIComponent(NAME)}`))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(downloadTransmission).not.toHaveBeenCalled();
  });
});
