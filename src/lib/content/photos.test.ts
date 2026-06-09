import { describe, it, expect } from 'vitest';
import type { Photo } from '@/lib/types';
import { validatePhotosManifest, generatePhotoId } from './photos';
import { SEED_PHOTOS } from './seed';

function photo(id: string, key = `photos/${id}.jpg`, order = 0): Photo {
  return { id, key, order };
}

describe('validatePhotosManifest', () => {
  it('accepts a well-formed manifest', () => {
    const m = { version: 1, photos: [photo('a', 'photos/a.jpg', 0), photo('b', 'photos/b.png', 1)] };
    expect(validatePhotosManifest(m)).toEqual({ ok: true, errors: [] });
  });
  it('accepts the bundled seed (bare legacy keys)', () => {
    expect(validatePhotosManifest(SEED_PHOTOS).ok).toBe(true);
  });
  it('accepts a bare legacy filename key', () => {
    expect(validatePhotosManifest({ version: 1, photos: [photo('a', 'imageedit_1_403.jpg', 0)] }).ok).toBe(true);
  });
  it('accepts optional caption/date/series/w/h', () => {
    const p = { ...photo('a', 'photos/a.jpg', 0), caption: 'hi', date: '2026', series: 'red', w: 100, h: 80 };
    expect(validatePhotosManifest({ version: 1, photos: [p] }).ok).toBe(true);
  });
  it('rejects a non-1 version', () => {
    expect(validatePhotosManifest({ version: 2, photos: [] }).ok).toBe(false);
  });
  it('rejects when photos is not an array', () => {
    expect(validatePhotosManifest({ version: 1, photos: {} }).ok).toBe(false);
  });
  it('rejects duplicate ids', () => {
    const r = validatePhotosManifest({ version: 1, photos: [photo('a', 'photos/a.jpg', 0), photo('a', 'photos/b.jpg', 1)] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate/i);
  });
  it('rejects a path-traversal key', () => {
    expect(validatePhotosManifest({ version: 1, photos: [photo('a', 'photos/../secret.jpg', 0)] }).ok).toBe(false);
  });
  it('rejects a leading-slash key', () => {
    expect(validatePhotosManifest({ version: 1, photos: [photo('a', '/etc/passwd.jpg', 0)] }).ok).toBe(false);
  });
  it('rejects a non-image extension', () => {
    expect(validatePhotosManifest({ version: 1, photos: [photo('a', 'photos/a.exe', 0)] }).ok).toBe(false);
  });
  it('rejects a work-prefixed key in photos', () => {
    expect(validatePhotosManifest({ version: 1, photos: [photo('a', 'work/a.jpg', 0)] }).ok).toBe(false);
  });
  it('rejects a non-numeric order', () => {
    const bad = { ...photo('a', 'photos/a.jpg'), order: 'first' };
    expect(validatePhotosManifest({ version: 1, photos: [bad] }).ok).toBe(false);
  });
});

describe('generatePhotoId', () => {
  it('derives a slug from a prefixed key (drop prefix + ext, underscores to dashes)', () => {
    expect(generatePhotoId('photos/imageedit_1_403.jpg', [])).toBe('imageedit-1-403');
  });
  it('suffixes a collision', () => {
    expect(generatePhotoId('photos/a.jpg', ['a'])).toBe('ab');
  });
});
