import { describe, it, expect } from 'vitest';
import { sameOrigin } from './same-origin';

function req(headers: Record<string, string>): Request {
  return new Request('https://vlgfm.live/api/admin/x', { method: 'POST', headers });
}

describe('sameOrigin', () => {
  it('allows requests with no Origin header (non-browser clients)', () => {
    expect(sameOrigin(req({ host: 'vlgfm.live' }))).toBe(true);
  });
  it('allows a matching origin host', () => {
    expect(sameOrigin(req({ origin: 'https://vlgfm.live', host: 'vlgfm.live' }))).toBe(true);
  });
  it('rejects a cross-origin host', () => {
    expect(sameOrigin(req({ origin: 'https://evil.example', host: 'vlgfm.live' }))).toBe(false);
  });
  it('rejects a malformed Origin', () => {
    expect(sameOrigin(req({ origin: 'not a url', host: 'vlgfm.live' }))).toBe(false);
  });
});
