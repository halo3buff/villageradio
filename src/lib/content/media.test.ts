import { describe, it, expect } from 'vitest';
import { R2_PUBLIC_BASE, photoUrl, workImageUrl } from './media';

describe('photoUrl', () => {
  it('serves a prefixed key from the public R2 base', () => {
    expect(photoUrl('photos/imageedit_1_4032830485.jpg')).toBe(
      `${R2_PUBLIC_BASE}/photos/imageedit_1_4032830485.jpg`,
    );
  });
  it('serves a bare legacy key from /public', () => {
    expect(photoUrl('imageedit_1_4032830485.jpg')).toBe(
      '/images/photography/negative/imageedit_1_4032830485.jpg',
    );
  });
});

describe('workImageUrl', () => {
  it('serves a work-prefixed key from the public R2 base', () => {
    expect(workImageUrl('work/cover.png')).toBe(`${R2_PUBLIC_BASE}/work/cover.png`);
  });
});
