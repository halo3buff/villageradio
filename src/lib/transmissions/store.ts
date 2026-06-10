import { Storage } from '@google-cloud/storage';
import type { TransmissionItem } from '@/lib/types';
import {
  assertSafeTransmissionName,
  classifyState,
  parseTransmissionName,
  keptDest,
  trashDest,
} from './names';

// The only module that talks to TRANSMISSIONS_BUCKET for moderation. Moderation state is encoded
// by object prefix (transmissions/new|kept|trash/…) — there is no manifest. One client per warm
// instance (ADC on Cloud Run; `gcloud auth application-default login` locally), as in store.ts.

const PREFIX = 'transmissions/';

let storage: Storage | null = null;
function client(): Storage {
  if (!storage) storage = new Storage();
  return storage;
}

export function transmissionsBucketName(): string {
  const name = process.env.TRANSMISSIONS_BUCKET;
  if (!name) throw new Error('TRANSMISSIONS_BUCKET is not set');
  return name;
}

interface GcsFileLike {
  name: string;
  metadata: { size?: string | number; timeCreated?: string };
}

function toItem(f: GcsFileLike): TransmissionItem {
  const cls = classifyState(f.name);
  const parsed = parseTransmissionName(f.name);
  return {
    name: f.name,
    handle: parsed.handle || 'anon',
    uploadedAt: parsed.uploadedAt || String(f.metadata.timeCreated ?? ''),
    sizeBytes: Number(f.metadata.size ?? 0),
    state: cls === 'incoming-bare' ? 'new' : cls,
  };
}

/** Lists the incoming moderation queue (new/ + legacy bare-root), newest first. */
export async function listQueue(): Promise<TransmissionItem[]> {
  const [files] = await client().bucket(transmissionsBucketName()).getFiles({ prefix: PREFIX });
  return (files as GcsFileLike[])
    .filter((f) => {
      const cls = classifyState(f.name);
      return cls === 'new' || cls === 'incoming-bare';
    })
    .map(toItem)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** Approves a transmission: moves it into the kept/ folder. */
export async function keepTransmission(name: string): Promise<void> {
  assertSafeTransmissionName(name);
  await client().bucket(transmissionsBucketName()).file(name).move(keptDest(name));
}

/** Soft-deletes a transmission: moves it into the trash/ folder (the bucket has no versioning). */
export async function deleteTransmission(name: string): Promise<void> {
  assertSafeTransmissionName(name);
  await client().bucket(transmissionsBucketName()).file(name).move(trashDest(name));
}

/** Reads a transmission's bytes for the admin playback proxy. Objects are ≤ 5 MB. */
export async function downloadTransmission(name: string): Promise<{ body: Buffer; contentType: string }> {
  assertSafeTransmissionName(name);
  const [body] = await client().bucket(transmissionsBucketName()).file(name).download();
  return { body, contentType: 'audio/webm' };
}
