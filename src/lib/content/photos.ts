import type { Photo, PhotosManifest } from '@/lib/types';
import { uniqueSuffix } from './ids';

// Pure photo-manifest helpers — mirror arrange.ts so the editor stays a thin, testable shell.

const IMAGE_NAME_RE = /^[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/i;

/**
 * A photo key is safe if it is a bare legacy basename (the 41 originals in /public) OR a
 * `photos/`-prefixed basename (R2 uploads). No traversal, no leading slash, no nested paths —
 * the resolver and `next/image` fetch `${R2_PUBLIC_BASE}/${key}` raw for prefixed keys.
 */
export function isSafePhotoKey(key: string): boolean {
  if (typeof key !== 'string' || key.includes('..') || key.startsWith('/')) return false;
  const base = key.startsWith('photos/') ? key.slice('photos/'.length) : key;
  return IMAGE_NAME_RE.test(base);
}

/** Derive a unique photo id from its key (drop prefix + extension, `_`→`-`), suffixing collisions. */
export function generatePhotoId(key: string, existingIds: Iterable<string>): string {
  const base = (key.split('/').pop() ?? key).replace(/\.[^.]+$/, '').replace(/_/g, '-');
  return uniqueSuffix(base, existingIds);
}

/** Structurally validate untrusted photos-manifest JSON before it is written. */
export function validatePhotosManifest(data: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const m = data as Partial<PhotosManifest> | null;

  if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest must be an object'] };
  if (m.version !== 1) errors.push('version must be 1');
  if (!Array.isArray(m.photos)) {
    errors.push('photos must be an array');
    return { ok: false, errors };
  }

  const seen = new Set<string>();
  m.photos.forEach((raw, i) => {
    const p = raw as Partial<Photo>;
    const at = `photo ${i}`;
    if (!p || typeof p !== 'object') {
      errors.push(`${at}: must be an object`);
      return;
    }
    if (typeof p.id !== 'string' || p.id.length === 0) errors.push(`${at}: id must be a non-empty string`);
    else if (seen.has(p.id)) errors.push(`${at}: duplicate id "${p.id}"`);
    else seen.add(p.id);

    if (typeof p.key !== 'string' || !isSafePhotoKey(p.key)) errors.push(`${at}: key must be a safe image filename`);
    if (typeof p.order !== 'number' || !Number.isFinite(p.order)) errors.push(`${at}: order must be a finite number`);

    for (const f of ['caption', 'date', 'series'] as const) {
      if (p[f] !== undefined && typeof p[f] !== 'string') errors.push(`${at}: ${f} must be a string`);
    }
    for (const f of ['w', 'h'] as const) {
      if (p[f] !== undefined && (typeof p[f] !== 'number' || !Number.isFinite(p[f]))) errors.push(`${at}: ${f} must be a number`);
    }
  });

  return { ok: errors.length === 0, errors };
}
