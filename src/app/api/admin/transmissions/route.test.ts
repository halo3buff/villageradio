import { describe, it, expect, beforeEach, vi } from 'vitest';

const { listQueue, keepTransmission, deleteTransmission, requireAdmin } = vi.hoisted(() => ({
  listQueue: vi.fn(),
  keepTransmission: vi.fn(),
  deleteTransmission: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/transmissions/store', () => ({ listQueue, keepTransmission, deleteTransmission }));
vi.mock('@/lib/auth/guard', () => ({ requireAdmin }));

import { GET, POST } from './route';

const NAME = 'transmissions/new/2026-05-17T22-14-03Z-anon-ab12cd34.webm';
const SAME = { origin: 'https://vlgfm.live', host: 'vlgfm.live' };

function postReq(body: unknown, headers: Record<string, string> = SAME): Request {
  return new Request('https://vlgfm.live/api/admin/transmissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
});

describe('GET /api/admin/transmissions', () => {
  it('returns the live queue behind the guard', async () => {
    const items = [{ name: NAME, handle: 'anon', uploadedAt: '', sizeBytes: 1, state: 'new' }];
    listQueue.mockResolvedValue(items);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalled();
    expect(await res.json()).toEqual({ items });
  });
});

describe('POST /api/admin/transmissions', () => {
  it('keeps a transmission', async () => {
    keepTransmission.mockResolvedValue(undefined);
    const res = await POST(postReq({ action: 'keep', name: NAME }));
    expect(res.status).toBe(200);
    expect(keepTransmission).toHaveBeenCalledWith(NAME);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('soft-deletes a transmission', async () => {
    deleteTransmission.mockResolvedValue(undefined);
    const res = await POST(postReq({ action: 'delete', name: NAME }));
    expect(res.status).toBe(200);
    expect(deleteTransmission).toHaveBeenCalledWith(NAME);
  });

  it('rejects a cross-origin request with 403 and does not move', async () => {
    const res = await POST(postReq({ action: 'keep', name: NAME }, { origin: 'https://evil.example', host: 'vlgfm.live' }));
    expect(res.status).toBe(403);
    expect(keepTransmission).not.toHaveBeenCalled();
  });

  it('rejects an unknown action with 400', async () => {
    const res = await POST(postReq({ action: 'nuke', name: NAME }));
    expect(res.status).toBe(400);
    expect(keepTransmission).not.toHaveBeenCalled();
    expect(deleteTransmission).not.toHaveBeenCalled();
  });

  it('rejects an unsafe name with 400 and does not move', async () => {
    const res = await POST(postReq({ action: 'delete', name: 'transmissions/../x.webm' }));
    expect(res.status).toBe(400);
    expect(deleteTransmission).not.toHaveBeenCalled();
  });

  it('rejects a missing name with 400', async () => {
    const res = await POST(postReq({ action: 'keep' }));
    expect(res.status).toBe(400);
  });

  it('runs the auth guard before doing anything', async () => {
    requireAdmin.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(POST(postReq({ action: 'keep', name: NAME }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(keepTransmission).not.toHaveBeenCalled();
  });
});
