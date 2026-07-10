import { unstable_cache, revalidateTag } from 'next/cache';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  BroadcastManifest,
  CommandsManifest,
  Mix,
  NavCommand,
  NewsManifest,
  NewsPost,
  Photo,
  PhotosManifest,
  WorkManifest,
  WorkProject,
} from '@/lib/types';
import { readManifest, readText } from './store';
import { broadcastFilesFrom, manifestToMixes } from './broadcast';
import { SEED_BROADCAST, SEED_COMMANDS, SEED_NEWS, SEED_PHOTOS, SEED_WORK } from './seed';

const REVALIDATE_S = 300;

type ManifestName = 'broadcast' | 'commands' | 'photos' | 'news' | 'work' | 'information';
const tag = (name: ManifestName) => `content:${name}`;

function configured(): boolean {
  return Boolean(process.env.CONFIG_BUCKET);
}

// Resilient: seed when unconfigured (local dev) or the object is absent (not seeded yet).
// Genuine GCS errors still propagate from the raw store.
async function loadManifest<T>(file: string, seed: T): Promise<T> {
  if (!configured()) return seed;
  const res = await readManifest<T>(file);
  if (!res) {
    console.warn(`[content] ${file} missing in CONFIG_BUCKET — using bundled seed`);
    return seed;
  }
  return res.data;
}

export const getBroadcastManifest = unstable_cache(
  () => loadManifest<BroadcastManifest>('broadcast.json', SEED_BROADCAST),
  ['content:broadcast'],
  { tags: [tag('broadcast')], revalidate: REVALIDATE_S },
);

export async function getBroadcast(): Promise<Mix[]> {
  return manifestToMixes(await getBroadcastManifest());
}

export async function getBroadcastFiles(): Promise<string[]> {
  return broadcastFilesFrom(await getBroadcastManifest());
}

export const getCommands = unstable_cache(
  async (): Promise<NavCommand[]> => {
    const m = await loadManifest<CommandsManifest>('commands.json', SEED_COMMANDS);
    return m.commands;
  },
  ['content:commands'],
  { tags: [tag('commands')], revalidate: REVALIDATE_S },
);

export const getPhotos = unstable_cache(
  async (): Promise<Photo[]> => {
    const m = await loadManifest<PhotosManifest>('photos.json', SEED_PHOTOS);
    return [...m.photos].sort((a, b) => a.order - b.order);
  },
  ['content:photos'],
  { tags: [tag('photos')], revalidate: REVALIDATE_S },
);

export const getNews = unstable_cache(
  async (): Promise<NewsPost[]> => {
    const m = await loadManifest<NewsManifest>('news.json', SEED_NEWS);
    return [...m.posts].sort((a, b) => a.order - b.order);
  },
  ['content:news'],
  { tags: [tag('news')], revalidate: REVALIDATE_S },
);

export const getWork = unstable_cache(
  async (): Promise<WorkProject[]> => {
    const m = await loadManifest<WorkManifest>('work.json', SEED_WORK);
    return [...m.projects].sort((a, b) => a.order - b.order);
  },
  ['content:work'],
  { tags: [tag('work')], revalidate: REVALIDATE_S },
);

export const getInformation = unstable_cache(
  async (): Promise<string> => {
    if (configured()) {
      const res = await readText('information.md');
      if (res) return res.text;
      console.warn('[content] information.md missing in CONFIG_BUCKET — using bundled file');
    }
    return readFileSync(join(process.cwd(), 'public', 'information', 'info_page.md'), 'utf-8');
  },
  ['content:information'],
  { tags: [tag('information')], revalidate: REVALIDATE_S },
);

/** Phase 2+ admin will call this after a write to push changes live immediately. */
export async function publishManifest(name: ManifestName): Promise<void> {
  revalidateTag(tag(name), {});
}
