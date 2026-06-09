// Usage:
//   export BLOB_READ_WRITE_TOKEN=...        # Vercel Blob read token
//   export TRANSMISSIONS_BUCKET=...         # target GCS bucket
//   gcloud auth application-default login   # ADC for GCS
//   node scripts/migrate-blob-to-gcs.mjs
import { list } from '@vercel/blob';
import { Storage } from '@google-cloud/storage';

const bucketName = process.env.TRANSMISSIONS_BUCKET;
if (!bucketName) throw new Error('TRANSMISSIONS_BUCKET is not set');

const storage = new Storage();
const bucket = storage.bucket(bucketName);

let cursor;
let copied = 0;
do {
  const { blobs, cursor: next } = await list({ cursor, limit: 100 });
  for (const blob of blobs) {
    // Transmissions were stored with access: 'private', so the blob URL requires the
    // Blob read/write token as a Bearer credential (a bare fetch returns 403).
    const res = await fetch(blob.downloadUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) throw new Error(`fetch failed for ${blob.pathname}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await bucket.file(blob.pathname).save(buf, {
      contentType: blob.contentType ?? 'audio/webm',
      resumable: false,
    });
    copied += 1;
    console.log(`copied ${blob.pathname}`);
  }
  cursor = next;
} while (cursor);

console.log(`done — copied ${copied} object(s) to gs://${bucketName}`);
