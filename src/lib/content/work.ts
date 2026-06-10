import type { WorkProject, WorkManifest } from '@/lib/types';
import { uniqueSuffix } from './ids';

// Pure work-manifest helpers — mirror arrange.ts / photos.ts.

const CATEGORIES = new Set(['branding', 'print', 'motion', 'identity']);
const IMAGE_NAME_RE = /^[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/i;

/** Work images live under the `work/` prefix on R2 (no legacy bare keys). No traversal/escape. */
export function isSafeWorkKey(key: string): boolean {
  if (typeof key !== 'string' || key.includes('..') || key.startsWith('/')) return false;
  if (!key.startsWith('work/')) return false;
  return IMAGE_NAME_RE.test(key.slice('work/'.length));
}

/** Derive a unique project id by slugifying the title, suffixing collisions. */
export function generateProjectId(title: string, existingIds: Iterable<string>): string {
  const base =
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project';
  return uniqueSuffix(base, existingIds);
}

/** Structurally validate untrusted work-manifest JSON before it is written. */
export function validateWorkManifest(data: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const m = data as Partial<WorkManifest> | null;

  if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest must be an object'] };
  if (m.version !== 1) errors.push('version must be 1');
  if (!Array.isArray(m.projects)) {
    errors.push('projects must be an array');
    return { ok: false, errors };
  }

  const seen = new Set<string>();
  m.projects.forEach((raw, i) => {
    const p = raw as Partial<WorkProject>;
    const at = `project ${i}`;
    if (!p || typeof p !== 'object') {
      errors.push(`${at}: must be an object`);
      return;
    }
    if (typeof p.id !== 'string' || p.id.length === 0) errors.push(`${at}: id must be a non-empty string`);
    else if (seen.has(p.id)) errors.push(`${at}: duplicate id "${p.id}"`);
    else seen.add(p.id);

    if (typeof p.title !== 'string' || p.title.trim().length === 0) errors.push(`${at}: title must be a non-empty string`);
    if (typeof p.year !== 'number' || !Number.isInteger(p.year)) errors.push(`${at}: year must be an integer`);
    if (typeof p.category !== 'string' || !CATEGORIES.has(p.category)) errors.push(`${at}: category must be branding|print|motion|identity`);
    if (!Array.isArray(p.images) || p.images.length === 0) errors.push(`${at}: images must be a non-empty array`);
    else if (!p.images.every(isSafeWorkKey)) errors.push(`${at}: every image must be a safe work/ key`);
    if (typeof p.order !== 'number' || !Number.isFinite(p.order)) errors.push(`${at}: order must be a finite number`);

    for (const f of ['client', 'description'] as const) {
      if (p[f] !== undefined && typeof p[f] !== 'string') errors.push(`${at}: ${f} must be a string`);
    }
  });

  return { ok: errors.length === 0, errors };
}
