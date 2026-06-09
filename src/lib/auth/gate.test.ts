import { describe, it, expect } from 'vitest';
import { gateDecision } from './gate';

describe('gateDecision', () => {
  it('passes non-admin paths', () => {
    expect(gateDecision('/listen', false)).toBe('pass');
    expect(gateDecision('/relay', false)).toBe('pass');
    expect(gateDecision('/api/audio/stream', false)).toBe('pass');
  });

  it('opens the login + logout endpoints without a session', () => {
    expect(gateDecision('/api/admin/login', false)).toBe('open');
    expect(gateDecision('/api/admin/logout', false)).toBe('open');
  });

  it('404s admin pages without a session', () => {
    expect(gateDecision('/admin', false)).toBe('notfound');
    expect(gateDecision('/admin/broadcast', false)).toBe('notfound');
    expect(gateDecision('/api/admin/broadcast', false)).toBe('notfound');
  });

  it('passes admin paths with a valid session', () => {
    expect(gateDecision('/admin/broadcast', true)).toBe('pass');
    expect(gateDecision('/api/admin/broadcast', true)).toBe('pass');
  });
});
