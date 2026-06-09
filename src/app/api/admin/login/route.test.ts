import { describe, it, expect, beforeAll } from 'vitest';
import { hashPassword } from '@/lib/auth/password';
import { POST } from './route';

const USERNAME = 'adnan';
const PASSWORD = 'a-long-correct-passphrase';

beforeAll(() => {
  process.env.ADMIN_USERNAME = USERNAME;
  process.env.ADMIN_PASSWORD_HASH = hashPassword(PASSWORD);
  process.env.SESSION_SECRET = 'test-session-secret-long-enough-xxxx';
});

function req(body: unknown, ip: string) {
  return new Request('http://localhost/api/admin/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'http://localhost',
      'host': 'localhost',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/login', () => {
  it('sets a session cookie on correct credentials', async () => {
    const res = await POST(req({ username: USERNAME, password: PASSWORD }, '10.0.0.1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toContain('vr_session=');
  });

  it('rejects a wrong password with 401', async () => {
    const res = await POST(req({ username: USERNAME, password: 'nope' }, '10.0.0.2'));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong username with 401', async () => {
    const res = await POST(req({ username: 'mallory', password: PASSWORD }, '10.0.0.3'));
    expect(res.status).toBe(401);
  });

  it('rejects a cross-origin request with 403', async () => {
    const bad = new Request('http://localhost/api/admin/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': 'http://evil.example',
        'host': 'localhost',
        'x-forwarded-for': '10.0.0.4',
      },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    const res = await POST(bad);
    expect(res.status).toBe(403);
  });

  it('rate-limits repeated attempts with 429', async () => {
    let last = 200;
    for (let i = 0; i < 12; i++) {
      const res = await POST(req({ username: USERNAME, password: 'wrong' }, '10.0.0.99'));
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
