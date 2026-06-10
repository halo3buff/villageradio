import { Storage } from '@google-cloud/storage';

const PREFIX = 'content/';

// One client per warm instance (as in the transmissions route). ADC on Cloud Run.
let storage: Storage | null = null;
function client(): Storage {
  if (!storage) storage = new Storage();
  return storage;
}

export function configBucketName(): string {
  const name = process.env.CONFIG_BUCKET;
  if (!name) throw new Error('CONFIG_BUCKET is not set');
  return name;
}

/** Thrown when an `ifGenerationMatch` write loses the optimistic-concurrency race. */
export class ConflictError extends Error {
  constructor(message = 'manifest generation mismatch — reload and retry') {
    super(message);
    this.name = 'ConflictError';
  }
}

function hasCode(err: unknown, code: number): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: number }).code === code
  );
}

export interface TextResult {
  text: string;
  generation: string;
}

/** Reads a raw object from `content/<name>`. Returns null if it doesn't exist. */
export async function readText(name: string): Promise<TextResult | null> {
  const file = client().bucket(configBucketName()).file(`${PREFIX}${name}`);
  try {
    const [buf] = await file.download();
    const [meta] = await file.getMetadata();
    return { text: buf.toString('utf-8'), generation: String(meta.generation ?? '') };
  } catch (err) {
    if (hasCode(err, 404)) return null;
    throw err;
  }
}

export interface ManifestResult<T> {
  data: T;
  generation: string;
}

/** Reads + parses a JSON manifest. Returns null if it doesn't exist. */
export async function readManifest<T>(name: string): Promise<ManifestResult<T> | null> {
  const res = await readText(name);
  if (!res) return null;
  return { data: JSON.parse(res.text) as T, generation: res.generation };
}

export interface WriteOptions {
  /** Generation the editor loaded; the write fails (ConflictError) if it changed. */
  ifGenerationMatch?: string | number;
}

async function save(name: string, body: string, contentType: string, opts: WriteOptions) {
  const file = client().bucket(configBucketName()).file(`${PREFIX}${name}`);
  try {
    await file.save(body, {
      contentType,
      resumable: false,
      ...(opts.ifGenerationMatch !== undefined
        ? { preconditionOpts: { ifGenerationMatch: Number(opts.ifGenerationMatch) } }
        : {}),
    });
  } catch (err) {
    if (hasCode(err, 412)) throw new ConflictError();
    throw err;
  }
}

export async function writeText(name: string, text: string, opts: WriteOptions = {}): Promise<void> {
  await save(name, text, 'text/markdown', opts);
}

export async function writeManifest<T>(name: string, data: T, opts: WriteOptions = {}): Promise<void> {
  await save(name, JSON.stringify(data, null, 2), 'application/json', opts);
}
