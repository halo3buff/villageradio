// The mix in progress, kept in this browser (IndexedDB) so a reload or a closed tab loses nothing:
// each piece's file once, and the arrangement on every change.

import type { Clip } from './mixer-core';

export type SavedClip = Omit<Clip, 'buf' | 'peaks'>;
export interface Draft { name: string; duck: number; clips: SavedClip[] }

const DB = 'vlg-mixer';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('files'); r.result.createObjectStore('state'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const q = fn(db.transaction(store, mode).objectStore(store));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}

export const putFile = (id: number, blob: Blob) => run('files', 'readwrite', (s) => s.put(blob, id)).catch(() => undefined);
export const getFile = (id: number) => run<Blob | undefined>('files', 'readonly', (s) => s.get(id)).catch(() => undefined);
export const saveDraft = (d: Draft) => run('state', 'readwrite', (s) => s.put(d, 'mix')).catch(() => undefined);
export const loadDraft = () => run<Draft | undefined>('state', 'readonly', (s) => s.get('mix')).catch(() => undefined);
export async function clearDraft() {
  await run('state', 'readwrite', (s) => s.clear()).catch(() => undefined);
  await run('files', 'readwrite', (s) => s.clear()).catch(() => undefined);
}
/** Files no longer on the timeline. */
export async function prune(keep: Set<number>) {
  const keys = await run<IDBValidKey[]>('files', 'readonly', (s) => s.getAllKeys()).catch(() => [] as IDBValidKey[]);
  for (const k of keys) if (!keep.has(Number(k))) await run('files', 'readwrite', (s) => s.delete(k)).catch(() => undefined);
}
