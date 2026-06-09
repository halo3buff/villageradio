export interface Mix {
  id: string;
  title: string;
  artist: string;
  date: string;
  duration: string;
  durationSec?: number;
  src: string;
  cover?: string;
  tags: string[];
  kind?: 'mix' | 'inter';
}

// --- Editable content manifests (GCS config bucket; see src/lib/content) ----------

export type BroadcastKind = 'mix' | 'inter';
export type BroadcastSeries = 'red' | 'green' | 'yellow';

export interface BroadcastEntry {
  id: string;
  title: string;
  artist: string;
  date: string;            // 'MM-DD-YYYY' ('' for interludes) — note: NewsPost.date is ISO 'YYYY-MM-DD'
  durationSec: number;     // probed on upload
  file: string;            // R2 filename — audio stays on Cloudflare R2 (free egress)
  kind: BroadcastKind;
  series?: BroadcastSeries; // mixes only; drives the ink swatch
  tags: string[];
}

export interface BroadcastManifest {
  version: 1;
  entries: BroadcastEntry[]; // play order IS the array order
}

export interface Photo {
  id: string;
  key: string;             // filename under public/images/photography/negative/
  caption?: string;
  date?: string;
  series?: string;
  order: number;
  w?: number;
  h?: number;
}

export interface PhotosManifest {
  version: 1;
  photos: Photo[];
}

export interface WorkProject {
  id: string;
  title: string;
  client?: string;
  year: number;
  category: 'branding' | 'print' | 'motion' | 'identity';
  images: string[];
  description?: string;
  order: number;
}

export interface WorkManifest {
  version: 1;
  projects: WorkProject[];
}

export interface NewsPost {
  id: string;
  title: string;
  date: string;            // 'YYYY-MM-DD'
  body: string;            // markdown
  status: 'draft' | 'published';
  order: number;
}

export interface NewsManifest {
  version: 1;
  posts: NewsPost[];
}

// --- Transmissions moderation (private GCS; state encoded by object prefix, no manifest) ----

export type TransmissionState = 'new' | 'kept' | 'trash';

export interface TransmissionItem {
  name: string;            // full GCS object name, e.g. 'transmissions/new/2026-…-anon-ab12cd34.webm'
  handle: string;          // parsed from the filename ('anon' fallback)
  uploadedAt: string;      // ISO parsed from the filename timestamp; GCS timeCreated fallback
  sizeBytes: number;
  state: TransmissionState;
}
