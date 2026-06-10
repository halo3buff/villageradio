import type { NewsPost, NewsManifest } from '@/lib/types';
import { uniqueSuffix } from './ids';

// Pure news-manifest helpers — mirror arrange.ts / photos.ts / work.ts so the editor stays a
// thin, testable shell.

const STATUSES = new Set(['draft', 'published']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // ISO YYYY-MM-DD (matches the seed; NOT the broadcast MM-DD-YYYY)

/** Derive a unique post id by slugifying the title, suffixing collisions. */
export function generatePostId(title: string, existingIds: Iterable<string>): string {
  const base =
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'post';
  return uniqueSuffix(base, existingIds);
}

/** Structurally validate untrusted news-manifest JSON before it is written. */
export function validateNewsManifest(data: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const m = data as Partial<NewsManifest> | null;

  if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest must be an object'] };
  if (m.version !== 1) errors.push('version must be 1');
  if (!Array.isArray(m.posts)) {
    errors.push('posts must be an array');
    return { ok: false, errors };
  }

  const seen = new Set<string>();
  m.posts.forEach((raw, i) => {
    const p = raw as Partial<NewsPost>;
    const at = `post ${i}`;
    if (!p || typeof p !== 'object') {
      errors.push(`${at}: must be an object`);
      return;
    }
    if (typeof p.id !== 'string' || p.id.length === 0) errors.push(`${at}: id must be a non-empty string`);
    else if (seen.has(p.id)) errors.push(`${at}: duplicate id "${p.id}"`);
    else seen.add(p.id);

    if (typeof p.title !== 'string' || p.title.trim().length === 0) errors.push(`${at}: title must be a non-empty string`);
    if (typeof p.date !== 'string' || !DATE_RE.test(p.date)) errors.push(`${at}: date must be YYYY-MM-DD`);
    if (typeof p.body !== 'string') errors.push(`${at}: body must be a string`);
    if (typeof p.status !== 'string' || !STATUSES.has(p.status)) errors.push(`${at}: status must be draft|published`);
    if (typeof p.order !== 'number' || !Number.isFinite(p.order)) errors.push(`${at}: order must be a finite number`);
  });

  return { ok: errors.length === 0, errors };
}
