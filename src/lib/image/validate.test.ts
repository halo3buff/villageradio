import { describe, it, expect } from 'vitest';
import { sniffImageType, EXT, safeImageName } from './validate';

function bytes(...prefix: number[]): Uint8Array {
  const b = new Uint8Array(64);
  b.set(prefix);
  return b;
}

// WEBP: 'RIFF' (52 49 46 46) .... 'WEBP' (57 45 42 50) at offset 8.
function webpBytes(): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  return b;
}

describe('sniffImageType', () => {
  it('accepts a JPEG (FF D8 FF)', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
  });
  it('accepts a PNG (89 50 4E 47 0D 0A 1A 0A)', () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
  });
  it('accepts a WEBP (RIFF....WEBP)', () => {
    expect(sniffImageType(webpBytes())).toBe('image/webp');
  });
  it('rejects MP3 frame-sync bytes (FF FB)', () => {
    expect(sniffImageType(bytes(0xff, 0xfb, 0x90, 0x00))).toBeNull();
  });
  it('rejects all-zero bytes', () => {
    expect(sniffImageType(new Uint8Array(64))).toBeNull();
  });
  it('rejects an empty buffer', () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });
  it('rejects RIFF that is not WEBP (e.g. a WAV)', () => {
    const wav = new Uint8Array(64);
    wav.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]); // 'WAVE'
    expect(sniffImageType(wav)).toBeNull();
  });
});

describe('EXT', () => {
  it('maps each content type to a canonical extension', () => {
    expect(EXT['image/jpeg']).toBe('jpg');
    expect(EXT['image/png']).toBe('png');
    expect(EXT['image/webp']).toBe('webp');
  });
});

describe('safeImageName', () => {
  it('lowercases, slugs unsafe chars, and forces the extension', () => {
    expect(safeImageName('My Photo!.JPG', 'jpg')).toBe('my_photo_.jpg');
  });
  it('strips any path components', () => {
    expect(safeImageName('../../etc/passwd', 'png')).toBe('passwd.png');
    expect(safeImageName('a/b/c.webp', 'webp')).toBe('c.webp');
  });
  it('appends the extension when missing', () => {
    expect(safeImageName('noext', 'jpg')).toBe('noext.jpg');
  });
  it('replaces a wrong extension with the sniffed one', () => {
    expect(safeImageName('photo.png', 'jpg')).toBe('photo.jpg');
  });
  it('never yields traversal or slashes', () => {
    const out = safeImageName('..\\..\\x', 'png');
    expect(out.includes('..')).toBe(false);
    expect(out.includes('/')).toBe(false);
  });
});
