# Admin Phase 1 — Content Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the site's hardcoded content into editable, versioned JSON manifests in a private GCS "config" bucket, and cut every public page over to read them — behavior-preserving, with no admin UI yet.

**Architecture:** A tiny raw store (`store.ts`) is the only module that talks to the config bucket (`@google-cloud/storage` + ADC), with optimistic concurrency via `ifGenerationMatch`. A pure transform (`broadcast.ts`) turns the broadcast manifest into the runtime `Mix[]` and derives the stream allowlist. Cached loaders (`loaders.ts`, `unstable_cache` + tags + a 300s backstop) feed public pages and fall back to bundled seed JSON when the bucket is unset or unseeded. The broadcast lineup — consumed by client components — flows from an **async root layout** into `AudioProvider` and out through context. **Audio bytes stay on Cloudflare R2** (free egress); only the lineup/allowlist becomes editable.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), `@google-cloud/storage` v7 + ADC, `next/cache` (`unstable_cache`/`revalidateTag`), Vitest (already installed).

---

## Decisions made in this plan (veto before executing if you disagree)

1. **Audio origin = Cloudflare R2, unchanged.** R2 egress is free; GCS egress is not. Phase 1 does **not** move audio to GCS. `BroadcastEntry.file` is the R2 filename; the stream route keeps fetching from `R2_BASE`. Only the proxy *allowlist* moves from a hardcoded array to a manifest-derived one. (Memory `audio-streams-from-r2`; spec §4.3 amended.)
2. **Graceful seed fallback** *(user-confirmed)*. Bundled seed JSON is the single source for both the migration payload and a runtime fallback. Loaders return seed when `CONFIG_BUCKET` is unset (local dev) or the object is missing (404), logging a warning. Genuine non-404 GCS errors still throw. The raw store stays truthful (404 → `null`, conflict → `ConflictError`); only the public loaders are resilient.
3. **Cache = tag-bust + 300s backstop** *(user-confirmed)*. `unstable_cache` per manifest with a tag; Phase 2's publish will call `revalidateTag`; `revalidate: 300` backstops. A `next build` without `CONFIG_BUCKET` bakes seed into the initial cache entry — harmless in Phase 1 (seed == current content), refreshed at runtime by the backstop/tag.
4. **Seed data lives as JSON files** under `src/lib/content/seed/` — single source for both the app fallback and the `.mjs` migration script (true DRY; mirrors the repo's existing `news_strip.json`/`info_page.md` data-as-files pattern).
5. **Defer the `work` page render to Phase 3.** `work/page.tsx` is a contentless placeholder. Phase 1 ships its store reader + empty `work.json` (store layer complete) but leaves the page render for Phase 3, where the work manager + real projects land. `NewsStrip`'s ticker (`news_strip.json`) is out of scope.

---

## File structure

**Create**
- `src/lib/content/store.ts` — raw GCS read/write (`readText`/`readManifest`, `writeText`/`writeManifest`, `ConflictError`, `configBucketName`).
- `src/lib/content/broadcast.ts` — pure transform (no GCS): `PROXY`, `fileFromSrc`, `formatDuration`, `entryToMix`, `manifestToMixes`, `broadcastFilesFrom`.
- `src/lib/content/loaders.ts` — cached public readers + seed fallback + `publishManifest`.
- `src/lib/content/seed.ts` — typed re-export of the seed JSON.
- `src/lib/content/seed/broadcast.json`, `photos.json`, `news.json`, `work.json` — seed payloads.
- `scripts/seed-content.mjs` — one-time migration (seed JSON + `info_page.md` → GCS).
- Tests: `src/lib/content/broadcast.test.ts`, `src/lib/content/store.test.ts`.

**Modify**
- `src/lib/types.ts` — add manifest/entry types; reshape the (unused) `Photo` and replace `WorkItem` with `WorkProject`.
- `src/lib/audio-context.tsx` — `playlist` prop + context; drop `mixes.ts` import.
- `src/components/SDRWaterfall.tsx`, `src/components/LissajousScope.tsx` — read `playlist` from `useAudio()`.
- `src/app/layout.tsx` — async; read `getBroadcast()`; pass `playlist`.
- `src/app/api/audio/stream/route.ts` — allowlist from `getBroadcastFiles()`; R2 untouched.
- `src/app/photography/page.tsx`, `src/app/news/page.tsx`, `src/app/information/page.tsx` — async; read loaders.
- `.github/workflows/deploy.yml` — add `CONFIG_BUCKET` env.
- `docs/superpowers/specs/2026-06-08-admin-panel-design.md` — R2 lock-in (**done during planning**, Task 0).

**Delete**
- `src/lib/data/mixes.ts` (and the empty `src/lib/data/`) once no imports remain.

---

## Task 0: Spec doc R2 lock-in (docs-only) — DONE during planning

- [x] Amend the design spec §4.3 / §6 / §8 / §11-Phase-2 / §12.1 so audio is fixed on R2 and only the stream allowlist moves to the manifest. Already applied. Commit (if not already): `git add docs/superpowers/specs/2026-06-08-admin-panel-design.md && git commit -m "docs: keep audio on R2 — only the stream allowlist moves to the manifest"`

---

## Task 1: Content manifest types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Replace `src/lib/types.ts` with the extended types**

```ts
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
  date: string;            // 'MM-DD-YYYY' ('' for interludes)
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`Photo`/`WorkItem` were unused, so reshaping/replacing them is safe.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(content): manifest + entry types for the content store"
```

---

## Task 2: Pure broadcast transform (TDD)

**Files:**
- Create: `src/lib/content/broadcast.ts`
- Test: `src/lib/content/broadcast.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/content/broadcast.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { BroadcastManifest } from '@/lib/types';
import { entryToMix, formatDuration, manifestToMixes, broadcastFilesFrom } from './broadcast';

const manifest: BroadcastManifest = {
  version: 1,
  entries: [
    { id: 'inter-1', title: 'BREAK', artist: 'Village Radio', date: '', durationSec: 22, file: 'inter_1.mp3', kind: 'inter', tags: [] },
    { id: 'red-1', title: 'RED', artist: 'Village Radio', date: '06-28-2025', durationSec: 498, file: 'red_06-28-2025.mp3', kind: 'mix', series: 'red', tags: [] },
    { id: 'inter-1b', title: 'BREAK', artist: 'Village Radio', date: '', durationSec: 22, file: 'inter_1.mp3', kind: 'inter', tags: [] },
  ],
};

describe('formatDuration', () => {
  it('formats m:ss', () => {
    expect(formatDuration(498)).toBe('8:18');
    expect(formatDuration(22)).toBe('0:22');
  });
  it('formats h:mm:ss past an hour', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});

describe('entryToMix', () => {
  it('derives the R2 proxy src and the duration string', () => {
    const mix = entryToMix(manifest.entries[1]);
    expect(mix.src).toBe('/api/audio/stream?file=red_06-28-2025.mp3');
    expect(mix.duration).toBe('8:18');
    expect(mix.durationSec).toBe(498);
    expect(mix.kind).toBe('mix');
  });
});

describe('manifestToMixes', () => {
  it('preserves order and length', () => {
    const mixes = manifestToMixes(manifest);
    expect(mixes).toHaveLength(3);
    expect(mixes[0].id).toBe('inter-1');
  });
});

describe('broadcastFilesFrom', () => {
  it('dedupes repeated interludes', () => {
    expect(broadcastFilesFrom(manifest)).toEqual(['inter_1.mp3', 'red_06-28-2025.mp3']);
  });
});
```

- [ ] **Step 2: Run it (fails — module missing)**

Run: `npx vitest run src/lib/content/broadcast.test.ts`
Expected: FAIL — cannot find `./broadcast`.

- [ ] **Step 3: Implement `src/lib/content/broadcast.ts`**

```ts
import type { BroadcastEntry, BroadcastManifest, Mix } from '@/lib/types';

export const PROXY = '/api/audio/stream?file=';

/** '/api/audio/stream?file=inter_1.mp3' → 'inter_1.mp3' */
export function fileFromSrc(src: string): string {
  return src.startsWith(PROXY) ? src.slice(PROXY.length) : src;
}

/** Seconds → 'm:ss' (or 'h:mm:ss'). Matches the display format used today. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** Manifest entry → the runtime `Mix` the player/UI consume. src points at the R2 proxy. */
export function entryToMix(entry: BroadcastEntry): Mix {
  return {
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    date: entry.date,
    duration: formatDuration(entry.durationSec),
    durationSec: entry.durationSec,
    src: `${PROXY}${entry.file}`,
    tags: entry.tags,
    kind: entry.kind,
  };
}

export function manifestToMixes(m: BroadcastManifest): Mix[] {
  return m.entries.map(entryToMix);
}

/** Filenames the stream proxy may fetch — deduped (interludes repeat). */
export function broadcastFilesFrom(m: BroadcastManifest): string[] {
  return [...new Set(m.entries.map((e) => e.file))];
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/lib/content/broadcast.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/broadcast.ts src/lib/content/broadcast.test.ts
git commit -m "feat(content): pure broadcast manifest→Mix transform + allowlist derive"
```

---

## Task 3: Seed JSON + typed re-export

**Files:**
- Create: `src/lib/content/seed/broadcast.json`, `photos.json`, `news.json`, `work.json`
- Create: `src/lib/content/seed.ts`

- [ ] **Step 1: Create `src/lib/content/seed/broadcast.json`** (transcribed from `src/lib/data/mixes.ts`; `file` = R2 filename, `series` from the colour prefix)

```json
{
  "version": 1,
  "entries": [
    { "id": "inter-1", "title": "TRANSMISSION BREAK I", "artist": "Village Radio", "date": "", "durationSec": 22, "file": "inter_1.mp3", "kind": "inter", "tags": [] },
    { "id": "red-06-28-2025", "title": "RED 06.28.2025", "artist": "Village Radio", "date": "06-28-2025", "durationSec": 498, "file": "red_06-28-2025.mp3", "kind": "mix", "series": "red", "tags": [] },
    { "id": "inter-2", "title": "TRANSMISSION BREAK II", "artist": "Village Radio", "date": "", "durationSec": 20, "file": "inter_2.mp3", "kind": "inter", "tags": [] },
    { "id": "green-04-08-2026", "title": "GREEN 04.08.2026", "artist": "Village Radio", "date": "04-08-2026", "durationSec": 209, "file": "green_04-08-2026.mp3", "kind": "mix", "series": "green", "tags": [] },
    { "id": "inter-3", "title": "TRANSMISSION BREAK III", "artist": "Village Radio", "date": "", "durationSec": 105, "file": "inter_3.mp3", "kind": "inter", "tags": [] },
    { "id": "yellow-02-01-2026", "title": "YELLOW 02.01.2026", "artist": "Village Radio", "date": "02-01-2026", "durationSec": 305, "file": "yellow_02-01-2026.mp3", "kind": "mix", "series": "yellow", "tags": [] },
    { "id": "inter-4", "title": "TRANSMISSION BREAK IV", "artist": "Village Radio", "date": "", "durationSec": 20, "file": "inter_4.mp3", "kind": "inter", "tags": [] },
    { "id": "green-04-10-2026", "title": "GREEN 04.10.2026", "artist": "Village Radio", "date": "04-10-2026", "durationSec": 202, "file": "green_04-10-2026.mp3", "kind": "mix", "series": "green", "tags": [] },
    { "id": "inter-5", "title": "TRANSMISSION BREAK V", "artist": "Village Radio", "date": "", "durationSec": 37, "file": "inter_5.mp3", "kind": "inter", "tags": [] },
    { "id": "red-01-15-2026", "title": "RED 01.15.2026", "artist": "Village Radio", "date": "01-15-2026", "durationSec": 105, "file": "red_01-15-2026.mp3", "kind": "mix", "series": "red", "tags": [] },
    { "id": "inter-1b", "title": "TRANSMISSION BREAK I", "artist": "Village Radio", "date": "", "durationSec": 22, "file": "inter_1.mp3", "kind": "inter", "tags": [] },
    { "id": "green-05-19-2026", "title": "GREEN 05.19.2026", "artist": "Village Radio", "date": "05-19-2026", "durationSec": 355, "file": "green_05-19-2026.mp3", "kind": "mix", "series": "green", "tags": [] },
    { "id": "inter-2b", "title": "TRANSMISSION BREAK II", "artist": "Village Radio", "date": "", "durationSec": 20, "file": "inter_2.mp3", "kind": "inter", "tags": [] },
    { "id": "red-05-20-2026", "title": "RED 05.20.2026", "artist": "Village Radio", "date": "05-20-2026", "durationSec": 391, "file": "red_05-20-2026.mp3", "kind": "mix", "series": "red", "tags": [] },
    { "id": "inter-3b", "title": "TRANSMISSION BREAK III", "artist": "Village Radio", "date": "", "durationSec": 105, "file": "inter_3.mp3", "kind": "inter", "tags": [] },
    { "id": "green-05-20-2026", "title": "GREEN 05.20.2026", "artist": "Village Radio", "date": "05-20-2026", "durationSec": 235, "file": "green_05-20-2026.mp3", "kind": "mix", "series": "green", "tags": [] }
  ]
}
```

- [ ] **Step 2: Create `src/lib/content/seed/photos.json`** (41 filenames from `photography/page.tsx`, in source order; `order` = index)

```json
{
  "version": 1,
  "photos": [
    { "id": "imageedit_1_4032830485", "key": "imageedit_1_4032830485.jpg", "order": 0 },
    { "id": "imageedit_2_5295219581", "key": "imageedit_2_5295219581.jpg", "order": 1 },
    { "id": "imageedit_3_3561245105", "key": "imageedit_3_3561245105.jpg", "order": 2 },
    { "id": "imageedit_4_4137559447", "key": "imageedit_4_4137559447.jpg", "order": 3 },
    { "id": "imageedit_5_7454865225", "key": "imageedit_5_7454865225.jpg", "order": 4 },
    { "id": "imageedit_6_6647747721", "key": "imageedit_6_6647747721.jpg", "order": 5 },
    { "id": "imageedit_7_6783885179", "key": "imageedit_7_6783885179.jpg", "order": 6 },
    { "id": "imageedit_8_2444709663", "key": "imageedit_8_2444709663.jpg", "order": 7 },
    { "id": "imageedit_9_7007049846", "key": "imageedit_9_7007049846.jpg", "order": 8 },
    { "id": "imageedit_10_8619967754", "key": "imageedit_10_8619967754.jpg", "order": 9 },
    { "id": "imageedit_11_4593521330", "key": "imageedit_11_4593521330.jpg", "order": 10 },
    { "id": "imageedit_12_5012049933", "key": "imageedit_12_5012049933.jpg", "order": 11 },
    { "id": "imageedit_13_7605778872", "key": "imageedit_13_7605778872.jpg", "order": 12 },
    { "id": "imageedit_14_5085874280", "key": "imageedit_14_5085874280.jpg", "order": 13 },
    { "id": "imageedit_15_2778604151", "key": "imageedit_15_2778604151.jpg", "order": 14 },
    { "id": "imageedit_16_6231462993", "key": "imageedit_16_6231462993.jpg", "order": 15 },
    { "id": "imageedit_17_3089377819", "key": "imageedit_17_3089377819.jpg", "order": 16 },
    { "id": "imageedit_18_9041475796", "key": "imageedit_18_9041475796.jpg", "order": 17 },
    { "id": "imageedit_19_8620109001", "key": "imageedit_19_8620109001.jpg", "order": 18 },
    { "id": "imageedit_21_3890543109", "key": "imageedit_21_3890543109.jpg", "order": 19 },
    { "id": "imageedit_22_4647095204", "key": "imageedit_22_4647095204.jpg", "order": 20 },
    { "id": "imageedit_23_4484190545", "key": "imageedit_23_4484190545.jpg", "order": 21 },
    { "id": "imageedit_24_8567923604", "key": "imageedit_24_8567923604.jpg", "order": 22 },
    { "id": "imageedit_25_4704078271", "key": "imageedit_25_4704078271.jpg", "order": 23 },
    { "id": "imageedit_26_9444399844", "key": "imageedit_26_9444399844.jpg", "order": 24 },
    { "id": "imageedit_27_2082830774", "key": "imageedit_27_2082830774.jpg", "order": 25 },
    { "id": "imageedit_28_7143446878", "key": "imageedit_28_7143446878.jpg", "order": 26 },
    { "id": "imageedit_29_7091491116", "key": "imageedit_29_7091491116.jpg", "order": 27 },
    { "id": "imageedit_30_5934327159", "key": "imageedit_30_5934327159.jpg", "order": 28 },
    { "id": "imageedit_31_4361083790", "key": "imageedit_31_4361083790.jpg", "order": 29 },
    { "id": "imageedit_32_5986057362", "key": "imageedit_32_5986057362.jpg", "order": 30 },
    { "id": "imageedit_33_3970191891", "key": "imageedit_33_3970191891.jpg", "order": 31 },
    { "id": "imageedit_34_3862085734", "key": "imageedit_34_3862085734.jpg", "order": 32 },
    { "id": "imageedit_35_8331456541", "key": "imageedit_35_8331456541.jpg", "order": 33 },
    { "id": "imageedit_36_5983645060", "key": "imageedit_36_5983645060.jpg", "order": 34 },
    { "id": "imageedit_37_3345397114", "key": "imageedit_37_3345397114.jpg", "order": 35 },
    { "id": "imageedit_38_7342034733", "key": "imageedit_38_7342034733.jpg", "order": 36 },
    { "id": "imageedit_39_2478579523", "key": "imageedit_39_2478579523.jpg", "order": 37 },
    { "id": "imageedit_40_6800592125", "key": "imageedit_40_6800592125.jpg", "order": 38 },
    { "id": "imageedit_41_7885009128", "key": "imageedit_41_7885009128.jpg", "order": 39 },
    { "id": "imageedit_42_4314756183", "key": "imageedit_42_4314756183.jpg", "order": 40 }
  ]
}
```

- [ ] **Step 3: Create `src/lib/content/seed/news.json`** (the 2 posts from `news/page.tsx`, published)

```json
{
  "version": 1,
  "posts": [
    { "id": "transmission-notes-vol-i", "title": "Transmission Notes — Vol. I", "date": "2026-04-06", "body": "The signal is always there. Sometimes it is buried under noise. Sometimes the noise is the signal. We are still figuring out which.", "status": "published", "order": 0 },
    { "id": "on-the-archive", "title": "On the Archive", "date": "2026-02-14", "body": "An archive is not a record of what happened. It is a record of what survived.", "status": "published", "order": 1 }
  ]
}
```

- [ ] **Step 4: Create `src/lib/content/seed/work.json`** (no real projects yet; render deferred to Phase 3)

```json
{ "version": 1, "projects": [] }
```

- [ ] **Step 5: Create `src/lib/content/seed.ts`**

```ts
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
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (`resolveJsonModule` is enabled in `tsconfig.json`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/content/seed.ts src/lib/content/seed/
git commit -m "feat(content): bundled seed manifests (migration payload + runtime fallback)"
```

---

## Task 4: Raw GCS store (TDD)

**Files:**
- Create: `src/lib/content/store.ts`
- Test: `src/lib/content/store.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/content/store.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { file, bucket } = vi.hoisted(() => {
  const file = { download: vi.fn(), getMetadata: vi.fn(), save: vi.fn() };
  const bucket = { file: vi.fn(() => file) };
  return { file, bucket };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(() => ({ bucket: () => bucket })),
}));

import { readManifest, writeManifest, ConflictError } from './store';

beforeEach(() => {
  process.env.CONFIG_BUCKET = 'test-config-bucket';
  file.download.mockReset();
  file.getMetadata.mockReset();
  file.save.mockReset();
  bucket.file.mockClear();
});

describe('readManifest', () => {
  it('parses JSON and returns the generation', async () => {
    file.download.mockResolvedValue([Buffer.from('{"version":1,"entries":[]}')]);
    file.getMetadata.mockResolvedValue([{ generation: '7' }]);
    const res = await readManifest('broadcast.json');
    expect(res).toEqual({ data: { version: 1, entries: [] }, generation: '7' });
    expect(bucket.file).toHaveBeenCalledWith('content/broadcast.json');
  });

  it('returns null when the object is missing (404)', async () => {
    file.download.mockRejectedValue(Object.assign(new Error('No such object'), { code: 404 }));
    expect(await readManifest('broadcast.json')).toBeNull();
  });

  it('rethrows non-404 errors', async () => {
    file.download.mockRejectedValue(Object.assign(new Error('boom'), { code: 500 }));
    await expect(readManifest('broadcast.json')).rejects.toThrow('boom');
  });
});

describe('writeManifest', () => {
  it('forwards ifGenerationMatch to save', async () => {
    file.save.mockResolvedValue(undefined);
    await writeManifest('broadcast.json', { version: 1 }, { ifGenerationMatch: '7' });
    expect(file.save).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ preconditionOpts: { ifGenerationMatch: 7 } }),
    );
  });

  it('throws ConflictError on a 412 precondition failure', async () => {
    file.save.mockRejectedValue(Object.assign(new Error('precondition'), { code: 412 }));
    await expect(
      writeManifest('broadcast.json', {}, { ifGenerationMatch: '1' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/lib/content/store.test.ts`
Expected: FAIL — cannot find `./store`.

- [ ] **Step 3: Implement `src/lib/content/store.ts`**

```ts
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
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/lib/content/store.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/store.ts src/lib/content/store.test.ts
git commit -m "feat(content): GCS manifest store with optimistic concurrency (ifGenerationMatch)"
```

---

## Task 5: Cached public loaders + seed fallback

**Files:**
- Create: `src/lib/content/loaders.ts`

- [ ] **Step 1: Implement `src/lib/content/loaders.ts`**

```ts
import { unstable_cache, revalidateTag } from 'next/cache';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  BroadcastManifest,
  Mix,
  NewsManifest,
  NewsPost,
  Photo,
  PhotosManifest,
  WorkManifest,
  WorkProject,
} from '@/lib/types';
import { readManifest, readText } from './store';
import { broadcastFilesFrom, manifestToMixes } from './broadcast';
import { SEED_BROADCAST, SEED_NEWS, SEED_PHOTOS, SEED_WORK } from './seed';

const REVALIDATE_S = 300;

type ManifestName = 'broadcast' | 'photos' | 'news' | 'work' | 'information';
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
  revalidateTag(tag(name));
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: builds (loaders unused so far; `getInformation`'s `publishManifest` may warn as unused only if lint is strict — it is exported, so no warning).

- [ ] **Step 3: Commit**

```bash
git add src/lib/content/loaders.ts
git commit -m "feat(content): cached public loaders with seed fallback + tag revalidation"
```

---

## Task 6: Migration / seed script

**Files:**
- Create: `scripts/seed-content.mjs`

- [ ] **Step 1: Implement `scripts/seed-content.mjs`**

```js
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
```

- [ ] **Step 2: Lint (no GCS run yet — that's Task 15)**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-content.mjs
git commit -m "feat(content): one-time seed-content migration script"
```

---

## Task 7: Stream proxy allowlist from the manifest

**Files:**
- Modify: `src/app/api/audio/stream/route.ts`

- [ ] **Step 1: Replace the import + module-level allowlist**

Replace:
```ts
import type { NextRequest } from 'next/server';
import { broadcastFiles } from '@/lib/data/mixes';

export const runtime = 'nodejs';

const R2_BASE = 'https://pub-fa76dac35d0c4ddf9a81d5267a06b241.r2.dev';

// Allowlist derived from the broadcast playlist — single source of truth lives in
// src/lib/data/mixes.ts. Add a track there and it's automatically proxyable here.
const ALLOWED = new Set(broadcastFiles);

const MIME: Record<string, string> = {
```
with:
```ts
import type { NextRequest } from 'next/server';
import { getBroadcastFiles } from '@/lib/content/loaders';

export const runtime = 'nodejs';

const R2_BASE = 'https://pub-fa76dac35d0c4ddf9a81d5267a06b241.r2.dev';

// Allowlist derived from the broadcast manifest (GCS config bucket, cached) — the single
// source of truth. Audio bytes still come from R2; only the lineup is now editable.
const MIME: Record<string, string> = {
```

- [ ] **Step 2: Derive the allowlist per request inside `GET`**

Replace:
```ts
export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');
  if (!file || !ALLOWED.has(file)) return new Response('Not found', { status: 404 });
```
with:
```ts
export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');
  const allowed = new Set(await getBroadcastFiles());
  if (!file || !allowed.has(file)) return new Response('Not found', { status: 404 });
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: builds. (`mixes.ts` still present; other consumers switch in Tasks 8–9.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/audio/stream/route.ts
git commit -m "feat(content): derive stream allowlist from the broadcast manifest (R2 unchanged)"
```

---

## Task 8: Async layout + provider threading

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/lib/audio-context.tsx`

- [ ] **Step 1: `src/app/layout.tsx` — import the loader**

After `import { AudioProvider } from '@/lib/audio-context';` add:
```tsx
import { getBroadcast } from '@/lib/content/loaders';
```

- [ ] **Step 2: `src/app/layout.tsx` — make the layout async, read the manifest, pass it**

Replace:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceMono.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}>
      <head>
        <meta name="theme-color" content="#080808" />
      </head>
      <body className="bg-[#080808] text-vr-white min-h-screen font-sans">
        <AudioProvider>
```
with:
```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const playlist = await getBroadcast();
  return (
    <html lang="en" className={`${spaceMono.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}>
      <head>
        <meta name="theme-color" content="#080808" />
      </head>
      <body className="bg-[#080808] text-vr-white min-h-screen font-sans">
        <AudioProvider playlist={playlist}>
```

- [ ] **Step 3: `src/lib/audio-context.tsx` — drop the data import**

Replace:
```tsx
'use client';
import { createContext, useContext, useRef, useState } from 'react';
import type { Mix } from '@/lib/types';
import { broadcastPlaylist } from '@/lib/data/mixes';
```
with:
```tsx
'use client';
import { createContext, useContext, useRef, useState } from 'react';
import type { Mix } from '@/lib/types';
```

- [ ] **Step 4: Add `playlist` to the context type**

Replace:
```tsx
interface AudioCtx {
  currentTrack: Mix | null;
```
with:
```tsx
interface AudioCtx {
  playlist: Mix[];
  currentTrack: Mix | null;
```

- [ ] **Step 5: Accept the `playlist` prop**

Replace:
```tsx
export function AudioProvider({ children }: { children: React.ReactNode }) {
```
with:
```tsx
export function AudioProvider({ children, playlist }: { children: React.ReactNode; playlist: Mix[] }) {
```

- [ ] **Step 6: Swap the four `broadcastPlaylist` references for `playlist`**

In `wireBroadcastTrack`: `const track = broadcastPlaylist[idx];` → `const track = playlist[idx];`

In the `onended` handler:
```tsx
      const nextIdx = (broadcastIdxRef.current + 1) % broadcastPlaylist.length;
      const next = broadcastPlaylist[nextIdx];
```
→
```tsx
      const nextIdx = (broadcastIdxRef.current + 1) % playlist.length;
      const next = playlist[nextIdx];
```

In `tuneIntoBroadcast`: `durationsRef.current = await Promise.all(broadcastPlaylist.map(getDuration));` → `...await Promise.all(playlist.map(getDuration));`

In the same function's `console.log`: `trackTitle: broadcastPlaylist[trackIdx].title,` → `trackTitle: playlist[trackIdx].title,`

And: `audio.src = broadcastPlaylist[trackIdx].src;` → `audio.src = playlist[trackIdx].src;`

- [ ] **Step 7: Expose `playlist` in the provider value**

Replace:
```tsx
    <PlayerContext.Provider value={{
      currentTrack, isPlaying, mode, broadcastIndex,
```
with:
```tsx
    <PlayerContext.Provider value={{
      playlist,
      currentTrack, isPlaying, mode, broadcastIndex,
```

- [ ] **Step 8: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: builds. (`SDRWaterfall`/`LissajousScope` still import `broadcastPlaylist` directly — switched next.)

- [ ] **Step 9: Commit**

```bash
git add src/app/layout.tsx src/lib/audio-context.tsx
git commit -m "feat(content): thread broadcast manifest from async layout into AudioProvider"
```

---

## Task 9: Scope components read the playlist from context

**Files:**
- Modify: `src/components/SDRWaterfall.tsx`
- Modify: `src/components/LissajousScope.tsx`

- [ ] **Step 1: `SDRWaterfall.tsx` — swap imports (drop data import, reuse shared `formatDuration`)**

Replace:
```tsx
import { useAudio } from '@/lib/audio-context';
import { broadcastPlaylist } from '@/lib/data/mixes';
import type { Mix } from '@/lib/types';
```
with:
```tsx
import { useAudio } from '@/lib/audio-context';
import { formatDuration } from '@/lib/content/broadcast';
import type { Mix } from '@/lib/types';
```

- [ ] **Step 2: `SDRWaterfall.tsx` — delete the now-duplicated local `formatDuration`**

Remove this block:
```tsx
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
```
(Keep the local `parseDurSec` — only `formatDuration` moved.)

- [ ] **Step 3: `SDRWaterfall.tsx` — pull `playlist` from the context**

Replace:
```tsx
  const { currentTrack, isPlaying, mode, play, pause, analyserFreq } = useAudio();
```
with:
```tsx
  const { playlist, currentTrack, isPlaying, mode, play, pause, analyserFreq } = useAudio();
```

- [ ] **Step 4: `SDRWaterfall.tsx` — replace the four `broadcastPlaylist` references**

`selectedMix` init:
```tsx
  const [selectedMix, setSelectedMix] = useState<Mix>(
    broadcastPlaylist.find(t => t.kind === 'mix') ?? broadcastPlaylist[0]
  );
```
→
```tsx
  const [selectedMix, setSelectedMix] = useState<Mix>(
    playlist.find(t => t.kind === 'mix') ?? playlist[0]
  );
```

`uniqueTracks`:
```tsx
  const uniqueTracks = broadcastPlaylist.filter(
```
→
```tsx
  const uniqueTracks = playlist.filter(
```

Preload-durations effect (also fix the dependency array — `playlist` is a stable prop):
```tsx
  useEffect(() => {
    broadcastPlaylist.forEach((track) => {
```
→
```tsx
  useEffect(() => {
    playlist.forEach((track) => {
```
and change that effect's `}, []);` to `}, [playlist]);`

`globalIdx` in the list render: `const globalIdx = broadcastPlaylist.indexOf(mix);` → `const globalIdx = playlist.indexOf(mix);`

- [ ] **Step 5: `LissajousScope.tsx` — swap imports**

Replace:
```tsx
import { useAudio } from '@/lib/audio-context';
import { broadcastPlaylist } from '@/lib/data/mixes';
```
with:
```tsx
import { useAudio } from '@/lib/audio-context';
import type { Mix } from '@/lib/types';
```

- [ ] **Step 6: `LissajousScope.tsx` — make `getNowLabel` take the playlist**

Replace:
```tsx
function getNowLabel(index: number, mode: string): string | null {
  if (mode !== 'broadcast') return null;
  const track = broadcastPlaylist[index];
  if (!track) return null;
  if (track.kind === 'inter') return 'TRANSMISSION BREAK';
  const mixNum = broadcastPlaylist.slice(0, index + 1).filter(t => t.kind === 'mix').length;
  const totalMixes = broadcastPlaylist.filter(t => t.kind === 'mix').length;
  return `BROADCAST ${String(mixNum).padStart(2, '0')} OF ${String(totalMixes).padStart(2, '0')}`;
}
```
with:
```tsx
function getNowLabel(index: number, mode: string, playlist: Mix[]): string | null {
  if (mode !== 'broadcast') return null;
  const track = playlist[index];
  if (!track) return null;
  if (track.kind === 'inter') return 'TRANSMISSION BREAK';
  const mixNum = playlist.slice(0, index + 1).filter(t => t.kind === 'mix').length;
  const totalMixes = playlist.filter(t => t.kind === 'mix').length;
  return `BROADCAST ${String(mixNum).padStart(2, '0')} OF ${String(totalMixes).padStart(2, '0')}`;
}
```

- [ ] **Step 7: `LissajousScope.tsx` — pull `playlist` from context and pass it**

Replace:
```tsx
  const { isPlaying, mode, broadcastIndex, broadcastPlay, pause, analyserL, analyserR, analyserFreq, volume, setVolume } = useAudio();
```
with:
```tsx
  const { playlist, isPlaying, mode, broadcastIndex, broadcastPlay, pause, analyserL, analyserR, analyserFreq, volume, setVolume } = useAudio();
```
and:
```tsx
  const nowLabel = getNowLabel(broadcastIndex, mode);
```
→
```tsx
  const nowLabel = getNowLabel(broadcastIndex, mode, playlist);
```

- [ ] **Step 8: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: builds; no `react-hooks/exhaustive-deps` warning on the SDR effect.

- [ ] **Step 9: Commit**

```bash
git add src/components/SDRWaterfall.tsx src/components/LissajousScope.tsx
git commit -m "feat(content): scope components read the broadcast playlist from context"
```

---

## Task 10: Retire `mixes.ts`

**Files:**
- Delete: `src/lib/data/mixes.ts`

- [ ] **Step 1: Confirm nothing imports it**

Run: `grep -rn "data/mixes" src/`
Expected: no matches.

- [ ] **Step 2: Delete the file (and the now-empty directory)**

```bash
git rm src/lib/data/mixes.ts
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: builds.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(content): retire mixes.ts — the broadcast manifest is now the source"
```

---

## Task 11: Photography page → manifest

**Files:**
- Modify: `src/app/photography/page.tsx`

- [ ] **Step 1: Replace the imports + delete the hardcoded `negatives` array**

Replace:
```tsx
import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = { title: 'Photography' };

const negatives = [
  'imageedit_1_4032830485.jpg',
  'imageedit_2_5295219581.jpg',
  'imageedit_3_3561245105.jpg',
  'imageedit_4_4137559447.jpg',
  'imageedit_5_7454865225.jpg',
  'imageedit_6_6647747721.jpg',
  'imageedit_7_6783885179.jpg',
  'imageedit_8_2444709663.jpg',
  'imageedit_9_7007049846.jpg',
  'imageedit_10_8619967754.jpg',
  'imageedit_11_4593521330.jpg',
  'imageedit_12_5012049933.jpg',
  'imageedit_13_7605778872.jpg',
  'imageedit_14_5085874280.jpg',
  'imageedit_15_2778604151.jpg',
  'imageedit_16_6231462993.jpg',
  'imageedit_17_3089377819.jpg',
  'imageedit_18_9041475796.jpg',
  'imageedit_19_8620109001.jpg',
  'imageedit_21_3890543109.jpg',
  'imageedit_22_4647095204.jpg',
  'imageedit_23_4484190545.jpg',
  'imageedit_24_8567923604.jpg',
  'imageedit_25_4704078271.jpg',
  'imageedit_26_9444399844.jpg',
  'imageedit_27_2082830774.jpg',
  'imageedit_28_7143446878.jpg',
  'imageedit_29_7091491116.jpg',
  'imageedit_30_5934327159.jpg',
  'imageedit_31_4361083790.jpg',
  'imageedit_32_5986057362.jpg',
  'imageedit_33_3970191891.jpg',
  'imageedit_34_3862085734.jpg',
  'imageedit_35_8331456541.jpg',
  'imageedit_36_5983645060.jpg',
  'imageedit_37_3345397114.jpg',
  'imageedit_38_7342034733.jpg',
  'imageedit_39_2478579523.jpg',
  'imageedit_40_6800592125.jpg',
  'imageedit_41_7885009128.jpg',
  'imageedit_42_4314756183.jpg',
];
```
with:
```tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import { getPhotos } from '@/lib/content/loaders';

export const metadata: Metadata = { title: 'Photography' };
```

- [ ] **Step 2: Move the grid build into the async component (same seed/order ⇒ identical scatter)**

Replace:
```tsx
// Shuffle all cell indices, assign photos to the first N, leave the rest empty.
// This scatters photos with no structural pattern whatsoever.
const shuffledIndices = shuffle(TOTAL, 0x1a2b3c4d);
const grid: (string | null)[] = Array(TOTAL).fill(null);
shuffledIndices.slice(0, negatives.length).forEach((cellIdx, photoIdx) => {
  grid[cellIdx] = negatives[photoIdx];
});

export default function PhotographyPage() {
  return (
```
with:
```tsx
export default async function PhotographyPage() {
  const files = (await getPhotos()).map(p => p.key);

  // Scatter photos with no structural pattern — same seed + order ⇒ identical layout.
  const shuffledIndices = shuffle(TOTAL, 0x1a2b3c4d);
  const grid: (string | null)[] = Array(TOTAL).fill(null);
  shuffledIndices.slice(0, files.length).forEach((cellIdx, photoIdx) => {
    grid[cellIdx] = files[photoIdx];
  });

  return (
```
(`mulberry32`, `shuffle`, `COLS`, `ROWS`, `TOTAL` stay at module scope. The render body is unchanged.)

- [ ] **Step 3: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: builds.

- [ ] **Step 4: Commit**

```bash
git add src/app/photography/page.tsx
git commit -m "feat(content): photography page reads the photos manifest"
```

---

## Task 12: News page → manifest

**Files:**
- Modify: `src/app/news/page.tsx`

- [ ] **Step 1: Replace the imports + hardcoded posts + function signature**

Replace:
```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'News' };

const posts = [
  {
    title: 'Transmission Notes — Vol. I',
    date: '2026-04-06',
    body: 'The signal is always there. Sometimes it is buried under noise. Sometimes the noise is the signal. We are still figuring out which.',
  },
  {
    title: 'On the Archive',
    date: '2026-02-14',
    body: 'An archive is not a record of what happened. It is a record of what survived.',
  },
];

export default function NewsPage() {
```
with:
```tsx
import type { Metadata } from 'next';
import { getNews } from '@/lib/content/loaders';

export const metadata: Metadata = { title: 'News' };

export default async function NewsPage() {
  const posts = (await getNews()).filter(post => post.status === 'published');
```

- [ ] **Step 2: Key the article by `id` instead of `title`**

Replace `<article key={post.title} className="px-5 py-10 max-w-2xl">`
with `<article key={post.id} className="px-5 py-10 max-w-2xl">`

- [ ] **Step 3: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: builds.

- [ ] **Step 4: Commit**

```bash
git add src/app/news/page.tsx
git commit -m "feat(content): news page reads the news manifest (published, ordered)"
```

---

## Task 13: Information page → manifest

**Files:**
- Modify: `src/app/information/page.tsx`

- [ ] **Step 1: Replace the `fs` read with the loader**

Replace:
```tsx
import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Information' };

export default function InformationPage() {
  const filePath = path.join(process.cwd(), 'public', 'information', 'info_page.md');
  const raw = fs.readFileSync(filePath, 'utf-8');

  const blocks = raw.split(/\n\n+/).filter(s => s.trim());
```
with:
```tsx
import type { Metadata } from 'next';
import { getInformation } from '@/lib/content/loaders';

export const metadata: Metadata = { title: 'Information' };

export default async function InformationPage() {
  const raw = await getInformation();

  const blocks = raw.split(/\n\n+/).filter(s => s.trim());
```
(The block-parser render below is unchanged. The loader falls back to `public/information/info_page.md` when the manifest isn't present.)

- [ ] **Step 2: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: builds.

- [ ] **Step 3: Commit**

```bash
git add src/app/information/page.tsx
git commit -m "feat(content): information page reads the information document from the store"
```

---

## Task 14: Deploy wiring + bucket provisioning

**Files:**
- Modify: `.github/workflows/deploy.yml`
- (GCP, run once — Adnan owns GCP)

- [ ] **Step 1: Provision the config bucket (run once)**

```bash
# Private, versioned config bucket (same project/region as the rest of the stack):
gcloud storage buckets create gs://vlg-config-village-radio \
  --project village-radio --location us-central1 \
  --uniform-bucket-level-access --public-access-prevention

gcloud storage buckets update gs://vlg-config-village-radio --versioning

# Let the Cloud Run runtime SA read+write manifests:
gcloud storage buckets add-iam-policy-binding gs://vlg-config-village-radio \
  --member "serviceAccount:vlgfm-run@village-radio.iam.gserviceaccount.com" \
  --role roles/storage.objectAdmin
```
(Confirm the runtime SA email; memory `gcp-migration-state` records it as `vlgfm-run@…`.)

- [ ] **Step 2: Inject `CONFIG_BUCKET` in `.github/workflows/deploy.yml`**

Replace:
```yaml
            --set-env-vars "TRANSMISSIONS_BUCKET=${{ vars.GCP_TRANSMISSIONS_BUCKET }}" \
```
with:
```yaml
            --set-env-vars "TRANSMISSIONS_BUCKET=${{ vars.GCP_TRANSMISSIONS_BUCKET }},CONFIG_BUCKET=${{ vars.GCP_CONFIG_BUCKET }}" \
```
> `--set-env-vars` replaces the whole set, so both vars go in the one flag.
> Needs the repo Actions variable `GCP_CONFIG_BUCKET = vlg-config-village-radio` (Ameen owns
> repo admin — see `gcp-migration-state`). Non-secret, so the fallback is to inline the
> literal: `CONFIG_BUCKET=vlg-config-village-radio`.

- [ ] **Step 3: (optional) Local dev**

Leave `CONFIG_BUCKET` **unset** in `.env.local` for normal dev (loaders serve the seed). To
exercise the live GCS path locally, set `CONFIG_BUCKET=vlg-config-village-radio` and ensure
`gcloud auth application-default login` is active.

- [ ] **Step 4: Lint + commit (workflow only)**

Run: `npm run lint`
```bash
git add .github/workflows/deploy.yml
git commit -m "ci: inject CONFIG_BUCKET into Cloud Run for the content store"
```

---

## Task 15: Migrate + end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full check suite**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green (Vitest: `broadcast` + `store` suites pass).

- [ ] **Step 2: Behavior-preserving dev check (seed path — no `CONFIG_BUCKET`)**

Run `npm run dev`, then confirm against `main`:
- `/listen` — SDR archive list, durations, filters, and broadcast playback identical.
- `/` — Lissajous "NOW / BROADCAST n OF m" label correct; BROADCAST plays from R2.
- `/photography` — grid scatter pixel-identical (same seed + order).
- `/news` + `/information` — render unchanged.
- `curl -s -o /dev/null -w '%{http_code}' 'http://localhost:3000/api/audio/stream?file=red_06-28-2025.mp3'` → `200`; a bogus `file=` → `404`.

- [ ] **Step 3: Seed GCS + verify the live path**

```bash
export CONFIG_BUCKET=vlg-config-village-radio
node scripts/seed-content.mjs           # writes the 5 objects (create-only)
gcloud storage ls --all-versions gs://$CONFIG_BUCKET/content/
```
Expected: `broadcast.json`, `photos.json`, `news.json`, `work.json`, `information.md` listed.
Restart dev with `CONFIG_BUCKET` set → pages render identically, now sourced from GCS.

- [ ] **Step 4: Prove editability without a deploy**

Edit `gs://$CONFIG_BUCKET/content/news.json` (e.g. change a title) → reload within ≤300s
(or after a `revalidateTag` once Phase 2 wires publish) → the change appears with no deploy.
`gcloud storage ls --all-versions` shows the prior generation (rollback path proven).

- [ ] **Step 5: Final commit (if verification needed fixes)**

```bash
git commit -am "chore(content): phase 1 verification fixes" || echo "nothing to commit"
```

---

## Self-review notes (coverage vs spec §6 / §7 / §9 / §11 Phase 1)

- **Store: read/write, versioning, optimistic concurrency** → Task 4 (`ifGenerationMatch` →
  `ConflictError`); bucket versioning Task 14. Admin reads live via the raw store (Phase 2).
- **Cache + revalidate** → Task 5 (`unstable_cache` tags + 300s backstop, `publishManifest`).
- **Seed / migration** → Tasks 3 + 6.
- **Public pages on manifests** → broadcast (Tasks 7–9), photography/news/information
  (Tasks 11–13). Behavior-preserving throughout.
- **Retire `mixes.ts`; allowlist derived** → Tasks 2, 7, 10.
- **AVOID DUPLICATION** → seed JSON is the single source for app + script; `formatDuration`
  shared; allowlist + `Mix[]` derived from the one manifest (mirrors the old `mixes.ts`).
- **Audio stays on R2** → Task 0 + Decision 1; stream route keeps `R2_BASE`.

**Deferred (flagged):** `work` page render → Phase 3 (no data; store reader shipped now);
audio→GCS → rejected (R2 stays); `MEDIA_BUCKET` / uploads / signed URLs → Phase 2+; news
markdown rendering → Phase 4; `NewsStrip` ticker → out of scope.
