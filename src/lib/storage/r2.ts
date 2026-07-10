import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 over its S3-compatible API. Broadcast audio lives here (free egress); the
// public `pub-…r2.dev` URL the stream proxy reads must point at this same bucket. Reads use
// the public URL (no creds); only writes (admin uploads) need the credentials below.

let client: S3Client | null = null;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required('R2_ACCESS_KEY_ID'),
        secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: true,
    });
  }
  return client;
}

function bucket(): string {
  return required('R2_BUCKET');
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}

async function exists(key: string): Promise<boolean> {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/** Resolve a non-colliding key, suffixing the basename if the object already exists. */
async function uniqueKey(filename: string): Promise<string> {
  if (!(await exists(filename))) return filename;
  const dot = filename.lastIndexOf('.');
  const base = dot === -1 ? filename : filename.slice(0, dot);
  const ext = dot === -1 ? '' : filename.slice(dot);
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${randomUUID().slice(0, 8)}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}${ext}`;
}

/**
 * Generate a presigned PUT URL for a direct browser→R2 audio upload (bypasses Cloud Run's 32 MB
 * body limit). The key is collision-checked first; the signed URL expires in 15 minutes.
 * Returns `{ url, key }` — the client PUTs to `url`, then stages the manifest with `key`.
 */
export async function presignAudio(filename: string): Promise<{ url: string; key: string }> {
  const key = await uniqueKey(filename);
  const url = await getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: 'audio/mpeg' }),
    { expiresIn: 900 },
  );
  return { url, key };
}

/**
 * Upload an audio object to R2. The key is the manifest `file` (no prefix) so the stream proxy
 * can fetch `${R2_BASE}/${file}` directly. Returns the actual stored key (collision-suffixed).
 */
export async function putAudio(filename: string, body: Buffer, contentType: string): Promise<string> {
  const key = await uniqueKey(filename);
  await r2().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
  return key;
}

/**
 * Upload an image object to R2. `key` arrives ALREADY prefixed (`photos/…` | `work/…`) so images
 * never collide with the root-level audio files the stream allowlist derives from. Served
 * publicly via `${R2_PUBLIC_BASE}/${key}` through `next/image`. Returns the stored
 * (collision-suffixed) key — `uniqueKey` suffixes the basename, preserving the prefix.
 */
export async function putImage(key: string, body: Buffer, contentType: string): Promise<string> {
  const stored = await uniqueKey(key);
  await r2().send(new PutObjectCommand({ Bucket: bucket(), Key: stored, Body: body, ContentType: contentType }));
  return stored;
}
