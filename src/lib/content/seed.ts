import type {
  BroadcastManifest,
  NewsManifest,
  PhotosManifest,
  WorkManifest,
} from '@/lib/types';
import broadcast from './seed/broadcast.json';
import news from './seed/news.json';
import photos from './seed/photos.json';
import work from './seed/work.json';

// JSON imports widen literal types (e.g. `kind: string`), so cast through `unknown`.
export const SEED_BROADCAST = broadcast as unknown as BroadcastManifest;
export const SEED_NEWS = news as unknown as NewsManifest;
export const SEED_PHOTOS = photos as unknown as PhotosManifest;
export const SEED_WORK = work as unknown as WorkManifest;
