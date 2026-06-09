/**
 * One-time content migration: upload the bundled seed manifests + info_page.md to the
 * GCS config bucket. Idempotent — skips objects that already exist unless --force.
 *
 * Usage:
 *   CONFIG_BUCKET=vlg-config-village-radio node scripts/seed-content.mjs [--force]
 *
 * Auth: ADC (`gcloud auth application-default login`, or run on Cloud Run / Cloud Shell).
 * Payloads are tiny (<100 KB total), so the VPN→Google large-upload hang shouldn't apply;
 * if it does, run from Cloud Shell.
 */
import { Storage } from '@google-cloud/storage';
import { readFileSync } from 'node:fs';

const bucketName = process.env.CONFIG_BUCKET;
if (!bucketName) {
  console.error('CONFIG_BUCKET is not set');
  process.exit(1);
}
const force = process.argv.includes('--force');

const seedDir = new URL('../src/lib/content/seed/', import.meta.url);
const repoRoot = new URL('../', import.meta.url);
const read = (url) => readFileSync(url, 'utf-8');

const objects = [
  { name: 'content/broadcast.json', body: read(new URL('broadcast.json', seedDir)), contentType: 'application/json' },
  { name: 'content/photos.json',    body: read(new URL('photos.json', seedDir)),    contentType: 'application/json' },
  { name: 'content/news.json',      body: read(new URL('news.json', seedDir)),      contentType: 'application/json' },
  { name: 'content/work.json',      body: read(new URL('work.json', seedDir)),      contentType: 'application/json' },
  { name: 'content/information.md', body: read(new URL('public/information/info_page.md', repoRoot)), contentType: 'text/markdown' },
];

const storage = new Storage();
for (const o of objects) {
  const file = storage.bucket(bucketName).file(o.name);
  try {
    await file.save(o.body, {
      contentType: o.contentType,
      resumable: false,
      ...(force ? {} : { preconditionOpts: { ifGenerationMatch: 0 } }),
    });
    console.log(`wrote gs://${bucketName}/${o.name}`);
  } catch (err) {
    if (err?.code === 412) {
      console.log(`skip ${o.name} (already exists; pass --force to overwrite)`);
      continue;
    }
    throw err;
  }
}
console.log('done');
