// Image upload validation. Like the MP3 prober gates audio, the magic-byte sniff is the
// AUTHORITY on an upload's real type — never trust the browser-declared `blob.type`.
// (No width/height extraction in v1: the public + admin grids are `aspect-square fill`, so
//  `Photo.w/h` stay optional and unused. Add a header parser later if layout needs dims.)

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Canonical extension per accepted content type. */
export const EXT: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function startsWith(buf: Uint8Array, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  return sig.every((byte, i) => buf[offset + i] === byte);
}

/**
 * Sniff the real image type from leading magic bytes. Returns the canonical content type, or
 * null if the bytes are not a JPEG/PNG/WEBP (caller rejects). RIFF containers must carry the
 * 'WEBP' fourcc — a WAV (RIFF…WAVE) is correctly rejected.
 */
export function sniffImageType(buf: Uint8Array): ImageType | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

/**
 * Sanitize a client-supplied filename into a safe object basename, forcing `ext`. Strips any
 * path components first (so traversal/prefix-escape is impossible), lowercases, slugs unsafe
 * chars to `_`, collapses dot runs, and drops leading dots. The caller prepends the storage
 * prefix (`photos/` | `work/`) afterward.
 */
export function safeImageName(raw: string, ext: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const stem = base
    .toLowerCase()
    .replace(/\.[^.]*$/, '') // drop existing extension
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^\.+/, '');
  return `${stem || 'image'}.${ext}`;
}
