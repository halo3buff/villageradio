/**
 * One-time migration: upload the 41 bundled photography images to Cloudflare R2 under the
 * `photos/` prefix, then rewrite the seed `photos.json` keys to match. After this (and the next
 * admin Publish, which writes the prefixed keys to the live GCS manifest), photos serve from R2
 * via next/image instead of /public. The media URL resolver keeps bare (un-migrated) keys
 * serving from /public in the meantime, so the live site never breaks.
 *
 * Idempotent — skips objects that already exist; safe to re-run. Iterates the keys in
 * photos.json (the set is non-sequential — id #20 is absent), never a 1..N range.
 *
 * Usage:
 *   node scripts/migrate-photos-to-r2.mjs --dry-run      # preview, no creds/writes needed
 *   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… \
 *     node scripts/migrate-photos-to-r2.mjs
 *
 * Auth: R2 S3-API token with Object Read & Write — the SAME bucket bound to the public
 * pub-…r2.dev URL the app serves images from. R2 is Cloudflare (not Google), so the known
 * VPN→Google large-upload hang does NOT apply here. Gated only on the R2 write creds existing.
 */
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PREFIX = 'photos/';
const BATCH = 5; // small concurrency cap — a one-time, low-volume migration
const CONTENT_TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const dryRun = process.argv.includes('--dry-run');

const seedUrl = new URL('../src/lib/content/seed/photos.json', import.meta.url);
const photoDir = new URL('../public/images/photography/negative/', import.meta.url);

const seedText = readFileSync(seedUrl, 'utf-8');
const photos = JSON.parse(seedText).photos;

// Resolve each photo to its bare filename, local path, and target R2 key (idempotent: strip any
// existing photos/ prefix so a re-run targets the right local file and key).
const tasks = photos.map((p) => {
  const bare = p.key.replace(/^photos\//, '');
  const localUrl = new URL(bare, photoDir);
  if (!existsSync(localUrl)) {
    console.error(`missing local file for "${p.key}": ${localUrl.pathname}`);
    process.exit(1);
  }
  const ext = bare.split('.').pop().toLowerCase();
  return { bare, localUrl, key: `${PREFIX}${bare}`, contentType: CONTENT_TYPE[ext] ?? 'application/octet-stream' };
});

console.log(`${tasks.length} photos to migrate → ${PREFIX}*`);

if (dryRun) {
  for (const t of tasks) console.log(`  would upload ${t.bare} → ${t.key} (${t.contentType})`);
  console.log('dry run — no writes. seed keys would be rewritten to the photos/ prefix.');
  process.exit(0);
}

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is not set`);
    process.exit(1);
  }
  return v;
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  },
  forcePathStyle: true,
});
const bucket = required('R2_BUCKET');

async function exists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

async function migrate(t) {
  if (await exists(t.key)) {
    console.log(`  skip ${t.key} (already in R2)`);
    return;
  }
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: t.key, Body: readFileSync(t.localUrl), ContentType: t.contentType }),
  );
  console.log(`  uploaded ${t.key}`);
}

for (let i = 0; i < tasks.length; i += BATCH) {
  await Promise.all(tasks.slice(i, i + BATCH).map(migrate));
}

// Rewrite seed keys to the photos/ prefix (idempotent via the negative lookahead). String-level
// replace preserves the file's compact one-line-per-photo formatting.
const rewritten = seedText.replace(/("key":\s*")(?!photos\/)([^"]+)(")/g, `$1${PREFIX}$2$3`);
writeFileSync(seedUrl, rewritten);
console.log(`rewrote seed keys in ${seedUrl.pathname}`);
console.log('done — now Publish from /admin/photography to push the prefixed keys to the live manifest.');
