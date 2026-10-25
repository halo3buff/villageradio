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
  /** Stays in the archive/sidebar but skipped when computing the live rotation. */
  hidden?: boolean;
  /** Integrated loudness (LUFS) — playback trims loud masters to the common level. */
  lufs?: number;
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
  /** Excluded from the live rotation's play order/timing; still editable and playable standalone. */
  hidden?: boolean;
  /** Integrated loudness (LUFS), measured in the admin on upload. */
  lufs?: number;
}

/** A block on the day: entry `entry` starts at `start` (seconds after midnight, Eastern) and
 *  plays `plays` times back to back. */
export interface Placement {
  id: string;
  entry: string;
  start: number;
  plays: number;
}

export interface BroadcastManifest {
  version: 1;
  /** The library. Without a `schedule` it is also the play order, looped from midnight (legacy). */
  entries: BroadcastEntry[];
  /** The day as placed blocks. Unscheduled time is silence, or `filler` looping. */
  schedule?: Placement[];
  /** Entry id that loops through unscheduled time; absent → silence. */
  filler?: string;
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
  publishedAt?: string;    // ISO datetime, auto-captured on publish
}

export interface NewsManifest {
  version: 1;
  posts: NewsPost[];
}

export interface NavCommand {
  cmd: string;    // text the user types at the prompt
  route: string;  // Next.js route it navigates to
  label: string;  // friendly name shown in the README block
  /** Omit from the README block — the command still works if typed (obscurity). */
  hidden?: boolean;
  /** Inert at the prompt — typing it dies as SIG_UNKNOWN. For pages under construction. */
  blocked?: boolean;
}

export interface CommandsManifest {
  version: 1;
  commands: NavCommand[];
}

// Empty theme = no override; the site keeps its built-in look until an admin picks one.
export interface SiteManifest {
  theme: string;
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

/**
 * The command codes ARE the passwords — the README lists what each one opens,
 * never the code itself.
 */
export function censorCmd(_cmd: string): string {
  return '█'.repeat(5);   // fixed width: the length is a hint too
}
