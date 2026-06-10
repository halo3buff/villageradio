import { describe, it, expect } from 'vitest';
import type { WorkProject } from '@/lib/types';
import { validateWorkManifest, generateProjectId } from './work';
import { SEED_WORK } from './seed';

function project(id: string, over: Partial<WorkProject> = {}): WorkProject {
  return {
    id,
    title: id.toUpperCase(),
    year: 2026,
    category: 'branding',
    images: ['work/cover.jpg'],
    order: 0,
    ...over,
  };
}

describe('validateWorkManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateWorkManifest({ version: 1, projects: [project('a'), project('b', { order: 1 })] })).toEqual({
      ok: true,
      errors: [],
    });
  });
  it('accepts the bundled (empty) seed', () => {
    expect(validateWorkManifest(SEED_WORK).ok).toBe(true);
  });
  it('accepts optional client/description', () => {
    expect(validateWorkManifest({ version: 1, projects: [project('a', { client: 'X', description: 'y' })] }).ok).toBe(true);
  });
  it('rejects a non-1 version', () => {
    expect(validateWorkManifest({ version: 2, projects: [] }).ok).toBe(false);
  });
  it('rejects when projects is not an array', () => {
    expect(validateWorkManifest({ version: 1, projects: 'nope' }).ok).toBe(false);
  });
  it('rejects duplicate ids', () => {
    const r = validateWorkManifest({ version: 1, projects: [project('a'), project('a', { order: 1 })] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate/i);
  });
  it('rejects an empty title', () => {
    expect(validateWorkManifest({ version: 1, projects: [project('a', { title: '' })] }).ok).toBe(false);
  });
  it('rejects a non-integer year', () => {
    expect(validateWorkManifest({ version: 1, projects: [project('a', { year: 20.5 })] }).ok).toBe(false);
  });
  it('rejects an unknown category', () => {
    expect(validateWorkManifest({ version: 1, projects: [project('a', { category: 'web' as never })] }).ok).toBe(false);
  });
  it('rejects an empty images array', () => {
    expect(validateWorkManifest({ version: 1, projects: [project('a', { images: [] })] }).ok).toBe(false);
  });
  it('rejects an unsafe / non-work image key', () => {
    expect(validateWorkManifest({ version: 1, projects: [project('a', { images: ['work/../x.jpg'] })] }).ok).toBe(false);
    expect(validateWorkManifest({ version: 1, projects: [project('a', { images: ['photos/x.jpg'] })] }).ok).toBe(false);
  });
  it('rejects a non-numeric order', () => {
    expect(validateWorkManifest({ version: 1, projects: [project('a', { order: 'first' as never })] }).ok).toBe(false);
  });
});

describe('generateProjectId', () => {
  it('slugifies the title', () => {
    expect(generateProjectId('Brand X — Identity!', [])).toBe('brand-x-identity');
  });
  it('suffixes a collision', () => {
    expect(generateProjectId('Brand X', ['brand-x'])).toBe('brand-xb');
  });
  it('falls back to "project" for an empty slug', () => {
    expect(generateProjectId('!!!', [])).toBe('project');
  });
});
