import type { TransmissionState } from '@/lib/types';

// Pure helpers for transmission object names. Moderation state is encoded by object prefix
// (`transmissions/new|kept|trash/…`); there is no manifest. These guard every GCS access.

const PREFIX = 'transmissions/';

/**
 * Throws unless `name` is a safe object name under the transmissions prefix. Guards the
 * playback proxy (arbitrary-object read) and the keep/delete moves against path traversal.
 */
export function assertSafeTransmissionName(name: string): void {
  if (
    !name.startsWith(PREFIX) ||
    name.startsWith('/') ||
    name.includes('..') ||
    name.includes('//') ||
    !name.endsWith('.webm')
  ) {
    throw new Error(`unsafe transmission name: ${name}`);
  }
}

/** Classifies an object by its sub-prefix; bare-root objects count as incoming (back-compat). */
export function classifyState(name: string): TransmissionState | 'incoming-bare' {
  if (name.startsWith(`${PREFIX}kept/`)) return 'kept';
  if (name.startsWith(`${PREFIX}trash/`)) return 'trash';
  if (name.startsWith(`${PREFIX}new/`)) return 'new';
  return 'incoming-bare';
}

const NAME_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z-(.+)-[0-9a-f]{8}\.webm$/;

/** Extracts handle + ISO timestamp from the upload route's `<isoTs>-<handle>-<rand>.webm` format. */
export function parseTransmissionName(name: string): { handle: string; uploadedAt: string } {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const m = NAME_RE.exec(base);
  if (!m) return { handle: '', uploadedAt: '' };
  const [, date, hh, mm, ss, handle] = m;
  return { handle, uploadedAt: `${date}T${hh}:${mm}:${ss}Z` };
}

function basename(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1);
}

export function keptDest(name: string): string {
  return `${PREFIX}kept/${basename(name)}`;
}

export function trashDest(name: string): string {
  return `${PREFIX}trash/${basename(name)}`;
}
