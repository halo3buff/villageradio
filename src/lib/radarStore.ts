import { Storage } from '@google-cloud/storage';

/**
 * The radar's latest snapshot, kept in the config bucket so every server instance reads the
 * same one: a fresh instance answers from it at once instead of gathering every source first.
 * Written only from Cloud Run (K_SERVICE set), so a local dev server never overwrites production's.
 */

const OBJECT = 'radar/live.json';
let storage: Storage | null = null;
const file = () => {
  const bucket = process.env.CONFIG_BUCKET;
  return bucket ? (storage ??= new Storage()).bucket(bucket).file(OBJECT) : null;
};

export async function readSnapshot<T>(): Promise<T | null> {
  const f = file();
  if (!f) return null;
  try {
    const [buf] = await f.download();
    return JSON.parse(buf.toString('utf-8')) as T;
  } catch (err) {
    if ((err as { code?: number }).code === 404) return null;
    throw err;
  }
}

export async function writeSnapshot(data: unknown) {
  const f = file();
  if (!f || !process.env.K_SERVICE) return;
  await f.save(JSON.stringify(data), { contentType: 'application/json', resumable: false, metadata: { cacheControl: 'no-store' } });
}
