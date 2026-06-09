import { describe, it, expect } from 'vitest';
import type { NewsPost } from '@/lib/types';
import { validateNewsManifest, generatePostId } from './news';
import { SEED_NEWS } from './seed';

function post(id: string, over: Partial<NewsPost> = {}): NewsPost {
  return {
    id,
    title: id.toUpperCase(),
    date: '2026-04-06',
    body: 'A paragraph of body copy.',
    status: 'published',
    order: 0,
    ...over,
  };
}

describe('validateNewsManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateNewsManifest({ version: 1, posts: [post('a'), post('b', { order: 1 })] })).toEqual({
      ok: true,
      errors: [],
    });
  });
  it('accepts the bundled seed', () => {
    expect(validateNewsManifest(SEED_NEWS).ok).toBe(true);
  });
  it('accepts an empty body and a draft status', () => {
    expect(validateNewsManifest({ version: 1, posts: [post('a', { body: '', status: 'draft' })] }).ok).toBe(true);
  });
  it('rejects a non-object manifest', () => {
    expect(validateNewsManifest(null).ok).toBe(false);
    expect(validateNewsManifest('nope').ok).toBe(false);
  });
  it('rejects a non-1 version', () => {
    expect(validateNewsManifest({ version: 2, posts: [] }).ok).toBe(false);
  });
  it('rejects when posts is not an array', () => {
    expect(validateNewsManifest({ version: 1, posts: 'nope' }).ok).toBe(false);
  });
  it('rejects duplicate ids', () => {
    const r = validateNewsManifest({ version: 1, posts: [post('a'), post('a', { order: 1 })] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate/i);
  });
  it('rejects an empty title', () => {
    expect(validateNewsManifest({ version: 1, posts: [post('a', { title: '' })] }).ok).toBe(false);
  });
  it('rejects a malformed date', () => {
    expect(validateNewsManifest({ version: 1, posts: [post('a', { date: '04-06-2026' })] }).ok).toBe(false);
    expect(validateNewsManifest({ version: 1, posts: [post('a', { date: '' })] }).ok).toBe(false);
  });
  it('rejects a non-string body', () => {
    expect(validateNewsManifest({ version: 1, posts: [post('a', { body: 42 as never })] }).ok).toBe(false);
  });
  it('rejects an unknown status', () => {
    expect(validateNewsManifest({ version: 1, posts: [post('a', { status: 'archived' as never })] }).ok).toBe(false);
  });
  it('rejects a non-numeric order', () => {
    expect(validateNewsManifest({ version: 1, posts: [post('a', { order: 'first' as never })] }).ok).toBe(false);
  });
});

describe('generatePostId', () => {
  it('slugifies the title', () => {
    expect(generatePostId('Transmission Notes — Vol. I', [])).toBe('transmission-notes-vol-i');
  });
  it('suffixes a collision', () => {
    expect(generatePostId('On the Archive', ['on-the-archive'])).toBe('on-the-archiveb');
  });
  it('falls back to "post" for an empty slug', () => {
    expect(generatePostId('', [])).toBe('post');
    expect(generatePostId('!!!', [])).toBe('post');
  });
});
