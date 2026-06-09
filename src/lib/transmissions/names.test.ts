import { describe, it, expect } from 'vitest';
import {
  assertSafeTransmissionName,
  classifyState,
  parseTransmissionName,
  keptDest,
  trashDest,
} from './names';

const VALID = 'transmissions/new/2026-05-17T22-14-03Z-anon-ab12cd34.webm';

describe('assertSafeTransmissionName', () => {
  it('accepts well-formed names under the transmissions prefix', () => {
    expect(() => assertSafeTransmissionName(VALID)).not.toThrow();
    expect(() => assertSafeTransmissionName('transmissions/x.webm')).not.toThrow();
    expect(() => assertSafeTransmissionName('transmissions/kept/x.webm')).not.toThrow();
  });

  it('rejects path traversal', () => {
    expect(() => assertSafeTransmissionName('transmissions/../secret.webm')).toThrow();
    expect(() => assertSafeTransmissionName('../etc/passwd.webm')).toThrow();
  });

  it('rejects double slashes and leading slashes', () => {
    expect(() => assertSafeTransmissionName('transmissions//x.webm')).toThrow();
    expect(() => assertSafeTransmissionName('/transmissions/x.webm')).toThrow();
  });

  it('rejects names outside the transmissions prefix', () => {
    expect(() => assertSafeTransmissionName('content/broadcast.json')).toThrow();
    expect(() => assertSafeTransmissionName('foo/transmissions/x.webm')).toThrow();
  });

  it('rejects non-webm objects', () => {
    expect(() => assertSafeTransmissionName('transmissions/new/x.json')).toThrow();
    expect(() => assertSafeTransmissionName('transmissions/new/x')).toThrow();
  });
});

describe('classifyState', () => {
  it('classifies by sub-prefix', () => {
    expect(classifyState('transmissions/new/x.webm')).toBe('new');
    expect(classifyState('transmissions/kept/x.webm')).toBe('kept');
    expect(classifyState('transmissions/trash/x.webm')).toBe('trash');
  });

  it('treats bare root objects as incoming (back-compat)', () => {
    expect(classifyState('transmissions/x.webm')).toBe('incoming-bare');
  });
});

describe('parseTransmissionName', () => {
  it('extracts handle and ISO timestamp from a new/ name', () => {
    expect(parseTransmissionName(VALID)).toEqual({
      handle: 'anon',
      uploadedAt: '2026-05-17T22:14:03Z',
    });
  });

  it('handles a hyphenated handle', () => {
    const n = 'transmissions/new/2026-05-17T22-14-03Z-dj-cool-ab12cd34.webm';
    expect(parseTransmissionName(n)).toEqual({
      handle: 'dj-cool',
      uploadedAt: '2026-05-17T22:14:03Z',
    });
  });

  it('returns empties for an unparseable name', () => {
    expect(parseTransmissionName('transmissions/legacy.webm')).toEqual({
      handle: '',
      uploadedAt: '',
    });
  });
});

describe('keptDest / trashDest', () => {
  it('move a new/ object to the kept or trash folder by basename', () => {
    expect(keptDest(VALID)).toBe('transmissions/kept/2026-05-17T22-14-03Z-anon-ab12cd34.webm');
    expect(trashDest(VALID)).toBe('transmissions/trash/2026-05-17T22-14-03Z-anon-ab12cd34.webm');
  });

  it('move a bare-root object too', () => {
    expect(keptDest('transmissions/legacy.webm')).toBe('transmissions/kept/legacy.webm');
    expect(trashDest('transmissions/legacy.webm')).toBe('transmissions/trash/legacy.webm');
  });
});
