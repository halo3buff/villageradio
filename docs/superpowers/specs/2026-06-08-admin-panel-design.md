# Village Radio — Admin Panel Design

**Status:** Draft for review · **Date:** 2026-06-08 · **Branch:** `adnan`

A secure, hidden admin panel for vlgfm.live that lets the team upload and arrange
broadcast tracks, manage photography/work/news/information, and moderate user
transmissions — without a code deploy. Reuses the existing GCP/Cloud Run stack.

---

## 1. Goals & non-goals

**Goals**
- A single admin console to manage **all site content**: broadcast tracks + arrangement,
  photography, work portfolio, news, the information page, and transmissions moderation.
- **Edit content without a git deploy** — move the hardcoded data into an editable store.
- **Security first**: every admin route and API gated; obscurity for the entry point,
  real authentication/authorization behind it. Defense in depth.
- A **hidden entry** (soot-sprite easter egg) that's easy for the team, invisible to visitors.
- Stay true to the cybercore design system (a "broadcast console" register).
- Keep it **cheap** — reuse existing GCP services; add no paid infrastructure.

**Non-goals (for now)**
- Multi-user accounts / per-user audit identities (single shared login; we log actions but
  not distinct identities). TOTP/2FA is a later layer, designed-for but not built in v1.
- Public-facing changes to how listeners experience the broadcast.
- A general CMS or plugin system. This is a focused, hand-built console.

---

## 2. Current state (post-GCP-migration)

- **Hosting:** Cloud Run (containerized, Next.js `standalone`), `min 1 / max 4` instances,
  public (`--allow-unauthenticated`). Deploy via GitHub Actions + Workload Identity
  Federation on push to `main`. Runtime service account attached; GCP auth via ADC.
- **Broadcast audio:** Cloudflare R2 (public bucket), proxied through `/api/audio/stream`;
  allowlist derived from the hardcoded `src/lib/data/mixes.ts` (single source of truth).
- **Transmissions:** user webm uploads → **GCS** (`TRANSMISSIONS_BUCKET`, private; uniform
  bucket-level access + public-access-prevention) via `@google-cloud/storage` + ADC.
- **All other content is hardcoded in source:** news posts (`news/page.tsx`), photography
  filenames (`photography/page.tsx`), work (placeholder grid), info page (parses
  `public/information/info_page.md` with a tiny built-in block parser).
- **No database, no auth.** Only protection today: in-memory per-instance rate limiting
  (`src/middleware.ts` + `src/lib/rate-limit.ts`).
- **No test framework. No markdown library.** Duration probing is a self-contained Node
  script (`scripts/probe-durations.mjs`, MP3 frame parsing).

**Doc drift to fix as part of this work:** `AGENTS.md` still says "Deployment: Vercel" and
"Vercel Blob" (lines ~14–16, 27, 68, 82). Update to Cloud Run + GCS.

---

## 3. Scope (v1)

Full content scope, single shared login, hidden sprite entry. Built in phases (§11).

| Section | What it manages |
|---|---|
| **Broadcast** | Upload tracks; the ordered 24/7 arrangement (mixes + interludes); per-track metadata; staged publish. Supersedes `mixes.ts`. |
| **Photography** | Upload/reorder photos (negative series); per-photo caption/date/series. |
| **Work** | Portfolio projects: title, client, year, category, image set; grid order. |
| **News** | Editorial posts (title → date → body markdown); draft/publish. |
| **Information** | Edit the single `info_page.md` document. |
| **Transmissions** | Moderation queue for user uploads: play, keep, delete. |
| **Settings** | Session/account basics; later: featured home links, audit log view. |

---

## 4. Architecture

### 4.1 Constraints that shaped it
- **Multi-instance Cloud Run** → no in-memory session state; sessions must be **stateless**.
- **Ephemeral filesystem** → all writes go to object storage, never local disk.
- **Public Cloud Run service** → authorization must be **app-layer** (middleware + per route),
  not Cloud Run IAM.
- **ADC everywhere** → admin storage access reuses the runtime service account; **no new keys**.
- **Cheap** → no new always-on services (rules out Cloud SQL); reuse GCS.

### 4.2 Data store — JSON manifests in GCS (chosen over Firestore)

Editable content lives as **versioned JSON objects in a private GCS bucket** (the "config"
bucket), read/written by the app via `@google-cloud/storage` + ADC.

**Why this over Firestore:** reuses the exact storage stack/SA/ADC already wired (zero new
services to enable, secure, or learn); effectively free at this volume; **GCS object
versioning gives free edit history + one-click rollback**; content is naturally
document-shaped. The one downside (concurrent-edit races) is neutralized by the single-editor
model and guarded anyway with **optimistic concurrency** (`ifGenerationMatch`).

Manifests (one object each, under a `content/` prefix):
- `content/broadcast.json` — the ordered broadcast (replaces `mixes.ts` as source of truth)
- `content/photos.json`, `content/work.json`, `content/news.json`, `content/settings.json`
- `content/information.md` — the info page document (kept as `.md`, same block parser)
- Transmissions need no manifest: moderation state is encoded by **object prefix**
  (`transmissions/new/…` → `transmissions/kept/…`, or delete).

**Concurrency & history:** enable **object versioning** on the config bucket. Writes pass
`ifGenerationMatch` (the generation the editor loaded); a mismatch returns a 409 "reload &
retry" instead of silently overwriting. Rollback = restore a prior generation.

**Caching (keeps visitor traffic off GCS):** public pages read manifests through a cached
loader (`unstable_cache` / tagged fetch). **Publishing busts the tag** (`revalidateTag`) so
changes appear promptly; otherwise a short TTL backstops. Admin views read **live** (no cache).

### 4.3 Media storage & serving

> **DECISION (Phase 3, 2026-06-09): ALL admin-uploaded media — audio AND images — lives on
> Cloudflare R2. There is NO GCS `MEDIA_BUCKET`.** One R2 bucket, free egress, already wired for
> writes. Audio sits at the bucket root; images go under `photos/` and `work/` prefixes. This
> supersedes the original GCS-media-bucket recommendation below and **closes open item 12.2** (no
> public GCS bucket → no org-policy question). **Every future admin image upload (Phase 4
> news/editorial images, any later media) MUST follow the same R2-prefix pattern, not GCS.** User
> transmissions (Phase 5) are the one exception and stay on private GCS (`TRANSMISSIONS_BUCKET`).

- **Audio:** served through the existing `/api/audio/stream` proxy, which **keeps sourcing
  mixes from Cloudflare R2**. R2 egress is free and GCS egress is not, so **audio bytes stay
  on R2.** The only change vs. today: the proxy **allowlist is derived from `broadcast.json`**
  instead of a hardcoded array — same single-source-of-truth pattern, just editable.
- **Images:** written to R2 via the same S3 API as audio (`putImage` in `src/lib/storage/r2.ts`,
  sibling of `putAudio`) under `photos/`/`work/` prefixes; served **directly from the public
  `pub-…r2.dev` URL via `next/image`** (host allowlisted in `next.config.ts` → `remotePatterns`).
  The stream allowlist derives ONLY from `broadcast.json`, so a prefixed image can never be served
  as audio. Resolver: `src/lib/content/media.ts` (`photoUrl`/`workImageUrl`).
- *Superseded original recommendation: a public-read GCS media bucket fronted by Cloud CDN, with
  a private + signed-URL fallback. Dropped in favor of R2 to reuse the wired write path, keep
  egress free, and avoid the org public-bucket question entirely.*

### 4.4 Secrets — Secret Manager
Admin **username**, **Argon2id password hash**, and the **session signing secret** live in
**Secret Manager**, injected into Cloud Run via `--set-secrets` (not plaintext env). The
deploy workflow already uses keyless WIF; add the `--set-secrets` flags and grant the runtime
SA `secretAccessor`. (No `MEDIA_BUCKET` — images reuse R2 per §4.3.)

---

## 5. Security model (deep)

**Principle:** the sprite/hidden entry is *obscurity for the doorknob only*. Security comes
from authentication, authorization, and validation — never from hiding.

### 5.1 Authentication
- Single shared credential. Password verified with **Argon2id** (slow hash) against the hash
  in Secret Manager; **constant-time** comparison. No password or hash in repo/env plaintext.
- On success, issue a **stateless session cookie**.

### 5.2 Session
- Signed token (HMAC-SHA256 or JWT) carrying only `{ iat, exp }` (+ a version for revocation).
- Cookie flags: **`httpOnly`, `Secure`, `SameSite=Strict`, `Path=/`**, short TTL (e.g. 8h)
  with idle expiry. Stateless → works across Cloud Run instances with no shared store.
- Signing secret in Secret Manager; rotating it (bump version) invalidates all sessions.

### 5.3 Authorization / gating (defense in depth)
1. **Middleware** matches `/admin/:path*` and `/api/admin/:path*`. No valid session →
   **return 404** (the panel "doesn't exist"), per decision. Valid → continue.
2. **Per-route re-check** in every admin route handler / server action (never trust the
   middleware alone). Unauthenticated API calls → 401/404.
3. Admin pages set `noindex` and `Cache-Control: no-store`.

### 5.4 CSRF
`SameSite=Strict` cookies + **Origin/Referer validation** on all mutating requests +
**double-submit token** for state-changing POST/PUT/DELETE. Same-origin only.

### 5.5 Rate limiting & brute force
- Extend the existing middleware with a **strict login limiter** (per IP, low ceiling,
  backoff). Upload limiters already exist.
- In-memory limiter is per-instance (≤4 instances) — acceptable because the **slow Argon2id
  hash + a long random shared secret** make online brute force impractical. If we want a
  global counter later, a tiny GCS/Firestore counter is the cheap upgrade. TOTP is the
  stronger future layer.

### 5.6 Upload validation
- Server-side: **content-type allowlist + size cap + magic-byte sniffing** (don't trust the
  declared MIME); sanitize filenames (pattern already in the transmissions route); store
  **private**. Audio → `audio/mpeg` (+ wav/ogg/m4a); images → `image/jpeg|png|webp`.
- **Signed upload URLs are short-lived, single-object, single-method** (PUT), scoped to the
  media bucket.

### 5.7 Audit & headers
- Log admin actions (login success/failure, publish, upload, delete) with timestamp + IP to
  Cloud Logging. (Single identity, but still a trail.)
- Security headers via middleware/`next.config`: CSP, `X-Content-Type-Options`,
  `Referrer-Policy`, etc., tightened for `/admin`.

### 5.8 Hidden entry (client-side only)
- A key-sequence listener (the final sequence is the team's to choose) reveals the **soot
  sprite** beside the logo: the team's transparent PNG, with a **very subtle white outline**
  (low-opacity layered `drop-shadow` tracing the alpha) + gentle bob. **Auto-hides after 15s**
  if ignored; re-summon with the sequence. Clicking it navigates to the login.
- Nothing in the public markup/URLs reveals the panel. The login lives at an **unguessable,
  unlinked path** that serves the form; the **actual `/admin/*` panel 404s without a session**,
  so finding the login path still yields nothing without credentials.

---

## 6. Data model

TypeScript types live in `src/lib/types.ts` (extend existing `Mix` / `WorkItem` / `Photo`).

```ts
// broadcast.json — ordered; supersedes mixes.ts as the single source of truth
interface BroadcastManifest {
  version: 1;
  entries: BroadcastEntry[];      // play order IS the array order
}
interface BroadcastEntry {
  id: string;
  title: string;
  artist: string;
  date: string;                   // 'MM-DD-YYYY' ('' for interludes)
  durationSec: number;            // probed on upload
  file: string;                   // R2 filename — audio stays on Cloudflare R2 (free egress)
  kind: 'mix' | 'inter';
  series?: 'red' | 'green' | 'yellow';  // mixes only; drives the ink swatch
  tags: string[];
}
// Derived (mirrors today's mixes.ts): `mixes = entries.filter(kind==='mix')`,
// stream allowlist = unique entry.file set. Never maintained separately.

interface Photo { id; key; caption?; date?; series?; order: number; w?; h? }
interface WorkProject { id; title; client?; year; category; images: string[]; description?; order }
interface NewsPost { id; title; date; body /* markdown */; status: 'draft'|'published'; order }
// information.md — plain markdown document (existing block parser)
// settings.json — { featuredLinks?, ... } (grows later)
```

**Migration/seed:** a one-time script writes the current hardcoded data (`mixes.ts`, news
array, photography filenames, `info_page.md`) into the manifests, and uploads existing
in-repo/R2 media references. Public pages then read manifests; behavior is preserved. The 41
in-repo photos are migrated to R2 (`photos/` prefix) by `scripts/migrate-photos-to-r2.mjs`
(Phase 3); the media URL resolver serves un-migrated (bare) keys from `/public`, so nothing
breaks mid-migration.

---

## 7. Content store layer

`src/lib/content/store.ts` — the only module that talks to the config bucket.
- `readManifest<T>(name): Promise<{ data: T; generation: string }>`
- `writeManifest<T>(name, data, { ifGenerationMatch }): Promise<void>` (throws 409 on mismatch)
- Cached public reader: `getBroadcast()`, `getPhotos()`, … via `unstable_cache` + a tag per
  manifest; `publish()` calls `revalidateTag`.
- One client per warm instance (as in the transmissions route). Small, single-purpose,
  unit-testable.

Keeps the **AVOID DUPLICATION** rule: the broadcast manifest is the source; `mixes` list and
the proxy allowlist are *derived*, exactly like `mixes.ts` does now.

---

## 8. Upload flows

- **Audio (large, robust path):** **upload target is Cloudflare R2, not GCS** (see §4.3 — R2
  egress is free), so the GCS-specific detail below is superseded; the *pattern* still holds.
  Request a **signed/presigned upload URL** → browser PUTs **direct to R2** (bypasses Cloud
  Run's ~32 MB request cap) → server **probes duration** (reuse `probe-durations.mjs` frame
  logic against the R2 object) → write `broadcast.json`. Typical mixes are 3–8 MB, so a
  through-app path also works as a fallback.
  → *Open item 12.1: the VPN-to-Google hang may affect direct browser→GCS uploads of large
  files; test, since the heavy leg from a laptop is the same direct-to-Google upload that
  hung before. Mitigation: through-app for small files; turn VPN off for large ones; or keep
  the existing CI path for the occasional huge file.*
- **Images (small):** through-app POST (≤ 10 MB) → validate (content-type allowlist + size cap +
  **magic-byte sniff, which is the authoritative type — `blob.type` is not trusted**) → write to
  **R2** under `photos/`/`work/` (not GCS — see §4.3) → update `photos.json` / `work.json`. Serve
  via `next/image` from the public R2 URL. Shared handler: `src/lib/image/upload-handler.ts`.

No new dependencies: duration probing and markdown parsing reuse existing in-repo code.

---

## 9. Routes & surface

**Pages**
- `/<secret-login-path>` — login form (unlinked, unguessable).
- `/admin` → redirect to `/admin/broadcast`.
- `/admin/{broadcast,photography,work,news,information,transmissions,settings}`.

**API (`/api/admin/*`, all behind the 404 gate + per-route auth)**
- `POST login`, `POST logout`
- `GET/PUT broadcast`, `photos`, `work`, `news`, `information`, `settings`
- `POST upload-url` (signed URL) · `GET/POST transmissions` (list / keep+delete) ·
  `GET transmissions/audio` (Phase 5: private-object playback proxy, `requireAdmin`-gated)

**Public refactors:** `listen`/home (broadcast), `photography`, `work`, `news`, `information`
read manifests via the cached store instead of hardcoded data. `/api/audio/stream` allowlist
derives from `broadcast.json`.

---

## 10. Design system mapping

Broadcast-console register within the existing tokens (`#080808`, `#e8e4d9`, signal-green
**live-only**, monospace chrome, **borders not fills, no rounded corners, no icon libraries,
no spinners — `loading..`/text states**). Components to build (hand-rolled, atomic):
`AdminShell`, `SidebarNav` (flat, lowercase, opacity states), `LiveStrip`, `ArrangementList`
(drag-reorder + staged changes), `UploadDrawer`, `SeriesSwatch` (print-ink: red/green-sage/
yellow, square — distinct from the live dot), `MediaGrid`, `EditorialEditor`,
`ModerationQueue`, `LoginForm`, `SootSprite`.

**Justified new dependencies (confirm):** a drag-and-drop primitive — try native HTML5 DnD
first, reach for `@dnd-kit` only if needed (behavior lib, not a UI kit). Possibly a test
runner (see §13). Nothing else.

---

## 11. Phased build plan

Each phase ships independently and must pass **lint + typecheck + build** before completion.

- **Phase 0 — Security foundation.** Secret Manager secrets + deploy wiring; session lib
  (sign/verify); middleware 404 gate + per-route guard; login API (Argon2id, rate-limited);
  login page; hidden sprite entry (sequence → sprite → login). *Proves the gate before any
  content editing exists.*
- **Phase 1 — Content store.** `store.ts` (read/write, versioning, optimistic concurrency,
  cache + revalidate); seed/migration script; refactor public pages to read manifests
  (behavior-preserving). Retire `mixes.ts` as source (manifest takes over; allowlist derived).
- **Phase 2 — Broadcast admin.** Arrangement list (reorder, edit, staged publish); audio
  upload (target **R2**, not GCS — see §4.3) + duration probe. Stream proxy keeps sourcing
  from R2; **not** extended to GCS.
- **Phase 3 — Media admin** *(DONE — branch `adnan`, 2026-06-09)*. Photography + work grid
  managers; through-app image upload **to R2** (`photos/`/`work/` prefixes — **no GCS
  `MEDIA_BUCKET`**, see §4.3); public photography + work pages read manifests. Work is grid-only
  v1 (cover = `images[0]`; no `/work/[id]` detail pages).
- **Phase 4 — Editorial** *(DONE — branch `adnan`, 2026-06-09)*. News + information editors; both
  the public `/news` and `/information` pages now render through a shared, extracted block parser
  (`src/components/EditorialBody.tsx` — `# h1` / `---` / paragraph). **v1 DECISION: News is
  text-only** (title, date, markdown body, draft/publish status, order) — inline post images are
  deferred, so **no `news/` R2 prefix, no news upload route, and no parser image block** were
  built. When post images are added later they MUST upload to R2 under a `news/` prefix reusing
  `putImage` + the §4.3 pattern (not GCS), alongside an image block in the parser (TODO noted in
  `EditorialBody.tsx`). Information edits the single `information.md` document (text in
  `CONFIG_BUCKET`, same parser). **No new infra, secrets, or env — reuses the Phase 0/1 gates and
  needs no R2.**
- **Phase 5 — Transmissions moderation** *(DONE — branch `adnan`, 2026-06-09)*. Moderation queue:
  list → play → keep → delete, with state encoded purely by **object prefix** (no manifest, no
  staged-publish — each action is an immediate GCS move). **DECISIONS:** (a) **dedicated `new/` +
  `kept/` + `trash/` prefixes** — the public upload route now writes incoming uploads to
  `transmissions/new/` (`src/app/api/transmissions/route.ts`); `listQueue` surfaces `new/` **plus
  any legacy bare-root** `transmissions/*.webm` so nothing is stranded (no migration script).
  (b) **Playback proxies through an admin route** (`GET /api/admin/transmissions/audio`) that streams
  the private GCS bytes behind `requireAdmin()`, mirroring `/api/audio/stream` — **no signed URLs**,
  so no `signBlob` IAM grant / IAM Credentials API. (c) **Delete is soft** — the bucket has no object
  versioning, so `delete` **moves** the object to `transmissions/trash/` (recoverable via console)
  guarded by a two-click inline confirm; `keep` moves it to `transmissions/kept/`. New code:
  `src/lib/transmissions/{names,store}.ts` (own `Storage()` singleton on `TRANSMISSIONS_BUCKET`),
  `src/app/api/admin/transmissions/{route,audio/route}.ts`,
  `src/components/admin/ModerationQueue.tsx`. Security-critical name validation
  (`assertSafeTransmissionName`) is unit-tested against traversal. **The one manual gate: the runtime
  SA needs list/copy/delete on `TRANSMISSIONS_BUCKET`** (see §14.2 step 9) — upload only ever needed
  create. No new env, secrets, buckets, or APIs.
- **Phase 6 — Hardening & docs.** Settings, audit log view, security headers, CSP; **fix
  AGENTS.md drift**; final security review.

Each phase will get its own implementation plan (via writing-plans) when we reach it.

---

## 12. Open items / risks

1. **VPN vs direct-to-R2 uploads** (§8) — test whether the known VPN hang affects browser
   uploads of large mixes to R2; pick the default path accordingly. (Audio stays on R2 per
   §4.3, so this is an R2 upload concern, not GCS.) *Phase 3 note:* image upload is through-app
   (small) and the photo migration writes to R2 (Cloudflare, **not** Google) — the Google-VPN
   hang does not apply to either.
2. ~~**Org policy on public buckets**~~ **RESOLVED (Phase 3):** images reuse R2 (public
   `pub-…r2.dev`), so there is no public GCS bucket and the org-policy question never arises.
3. ~~**Markdown**~~ **RESOLVED (Phase 4):** the info page's block parser (`# h1` / `---` /
   paragraph) was extracted to `src/components/EditorialBody.tsx` and reused as-is for both news
   and information — no new lib. Confirmed enough for v1; a follow-up TODO in that file tracks
   extending it (`##`/`###`, lists, inline links/images) once the editorial flow is in use.
4. ~~**DnD approach**~~ **RESOLVED:** native HTML5 DnD across broadcast/photo/work managers —
   no `@dnd-kit`.
5. ~~**Transmissions**~~ **RESOLVED (Phase 5):** moderation now exists (list/play/keep/delete via
   `new/`→`kept/`/`trash/` prefix moves; private playback proxied behind `requireAdmin()`). Delete is
   **soft** (move to `transmissions/trash/`) since the bucket has no versioning. Still private —
   "feature on site" remains out of v1.
6. **Session secret rotation** — document the bump-to-revoke procedure.
7. **Backups** — rely on GCS object versioning for content history/rollback.

---

## 13. Testing

The repo has **no test framework today**; auth/session/store logic is exactly the kind of code
that warrants one. **Recommendation:** add **Vitest** (dev-only) for unit tests of: session
sign/verify + expiry, middleware gate (404 vs pass), login rate limiting, `store.ts`
read/write + `ifGenerationMatch` conflict, and upload validation (magic bytes/size). Follow
TDD for these. UI/DnD verified manually + via the existing build. *Adding Vitest is the one
tooling addition to confirm (strong justification: security-critical logic).*

---

## 14. Environment variables & manual setup

Tracks every runtime variable the panel needs and the manual (non-code) steps to provision
them, in order. Secrets live in **Secret Manager** (injected via `--set-secrets`); plain
config lives as Cloud Run env. Nothing sensitive is committed.

### 14.1 Environment variables

| Var | Where | Phase | Purpose |
|---|---|---|---|
| `ADMIN_USERNAME` | Secret Manager | 0 | Admin login username (constant-time compared in the login route). |
| `ADMIN_PASSWORD_HASH` | Secret Manager | 0 | `scrypt$N$r$p$salt$key` hash — generate with `src/lib/auth/password.ts`. Never store plaintext. |
| `SESSION_SECRET` | Secret Manager | 0 | HMAC-SHA256 session signing key (long random). |
| `SESSION_VERSION` | env (opt, def `1`) | 0 | Bump to revoke all live sessions. |
| `SESSION_TTL_MS` | env (opt, def 8h) | 0 | Session lifetime (idle expiry). |
| `ADMIN_LOGIN_PATH` | env (opt, def `/relay`) | 0 | Unguessable login path the sprite links to. |
| `CONFIG_BUCKET` | env | 1 | GCS bucket holding `content/*.json` manifests. Unset locally → bundled-seed fallback. |
| `TRANSMISSIONS_BUCKET` | env | pre-admin | GCS bucket for user transmissions. Already wired. |
| `R2_ACCOUNT_ID` | Secret Manager | 2 | Cloudflare account id → S3 endpoint `https://<id>.r2.cloudflarestorage.com`. |
| `R2_BUCKET` | Secret Manager | 2 | R2 bucket for audio. **Must be the same bucket bound to the public `pub-…r2.dev` URL** the stream proxy reads. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Secret Manager | 2 | R2 S3-API token (Object Read & Write) for through-app uploads (audio **and** images). |
| ~~`MEDIA_BUCKET`~~ | — | — | **Not used.** Phase 3 reuses R2 for images (see §4.3); no GCS image bucket. Images write via the same `R2_*` creds, under `photos/`/`work/` prefixes. |

R2 **read** needs no env — the public `pub-…r2.dev` URL is hardcoded in the stream proxy, the
duration prober, and the image resolver (`src/lib/content/media.ts`). Only R2 **writes** (Phase 2
audio + Phase 3 image uploads, and the photo migration) need credentials.

### 14.2 Manual setup (in order, with why)

**Blocking gates** (which steps must be done before a feature works in deployment): the admin
panel is unreachable until **3 + 4**; content editing/publish (broadcast arrangement, photo +
work metadata reorder/edit/delete/publish, **Phase 4 news posts, and the information document**)
needs **1 + 2 + 4** and does *not* depend on R2; **Phase 2 audio upload AND Phase 3 image upload +
the photo→R2 migration (step 7) are all non-functional until step 6** — the code is shipped +
unit-tested, but every R2 write fails without R2 credentials. **Phase 4 (Editorial) adds NO new
manual setup**: News is text-only (no images → no R2) and Information is text in `CONFIG_BUCKET`,
so both go live the moment the **1 + 2 + 4** gates are met. Until first publish they serve the
bundled seed (`src/lib/content/seed/news.json`) / bundled doc
(`public/information/info_page.md`); the first admin **Publish** creates `content/news.json` and
`content/information.md` via `ifGenerationMatch:0` (the generic step 5 — no Phase-4-specific
provisioning).

1. **Config bucket** — create the GCS `CONFIG_BUCKET`; enable **object versioning** (free edit
   history + one-click rollback), uniform bucket-level access, public-access-prevention.
   *Why first:* the content store can't persist edits without it.
2. **Grant runtime SA** `roles/storage.objectAdmin` (or objectUser) on the config bucket.
   *Why:* admin writes go through ADC; reads/writes 403 otherwise.
3. **Auth secrets** — create `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (scrypt helper),
   `SESSION_SECRET` in Secret Manager; grant runtime SA `secretAccessor`.
   *Why:* the gate fails closed — middleware throws and the panel is unreachable without them.
4. **Deploy wiring** — add `--set-secrets` for the auth (and Phase 2 R2) secrets plus
   `CONFIG_BUCKET`/`TRANSMISSIONS_BUCKET` env to the Cloud Run deploy workflow.
   *Why:* the app reads these at runtime; do this after the secrets exist.
5. **Seed manifests** — run the Phase 1 seed/migration, or let the first admin publish create
   `broadcast.json` via `ifGenerationMatch:0`. *Why:* public pages read manifests; until
   seeded they serve the bundled seed.
6. **(Phase 2 + 3 — gates audio AND image upload) R2 S3 token** — create a Cloudflare R2 API
   token (Object Read & Write); capture `R2_ACCOUNT_ID` + `R2_ACCESS_KEY_ID` +
   `R2_SECRET_ACCESS_KEY` + `R2_BUCKET`; **confirm `R2_BUCKET` is the same bucket bound to the
   public `pub-…r2.dev` URL** the stream proxy + image resolver read; add all four to Secret
   Manager + the Cloud Run `--set-secrets` wiring. *Why:* through-app uploads (audio at the
   bucket root; images under `photos/`/`work/`) write via the S3 API — a mismatched bucket
   uploads somewhere the public URL can't read, so playback / images would 404 even though the
   upload "succeeded". **Smoke test after wiring:** upload a small `.mp3` → `GET
   https://pub-…r2.dev/<returned file>` 200 → add to the lineup + publish → streams via
   `/api/audio/stream`; upload a `.jpg` in `/admin/photography` → `GET
   https://pub-…r2.dev/photos/<key>` 200 → publish → renders on `/photography`.
7. **(Phase 3 — one-time photo migration) move the 41 in-repo photos to R2.** After step 6 is
   wired, run `R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… node
   scripts/migrate-photos-to-r2.mjs` (preview first with `--dry-run`, which needs no creds). It
   uploads `public/images/photography/negative/*` under `photos/` and rewrites the seed
   `photos.json` keys. *Then* open `/admin/photography` and **Publish** so the prefixed keys land
   in the live GCS manifest. *Why:* until this runs, photo keys stay bare and serve from
   `/public` (the resolver handles both, so nothing breaks); after it, photos serve from R2.
   Idempotent; R2 is Cloudflare (not Google) so the VPN→Google hang does not apply.
8. **(Optional) Obscurity** — set `ADMIN_LOGIN_PATH` / finalize the key sequence if changing
   defaults. *Why:* doorknob obscurity only — real security is the gate + auth.
9. **(Phase 5 — gates the moderation queue) grant the runtime SA list/copy/delete on
   `TRANSMISSIONS_BUCKET`.** The public upload route only ever needed **create** (`.save()`), but
   moderation **lists** the queue and **moves** objects (`new/`→`kept/`/`trash/` = copy + delete), so
   grant the runtime SA `roles/storage.objectAdmin` (or `objectUser`) on `TRANSMISSIONS_BUCKET`.
   *Why:* `/admin/transmissions` 500s on load and keep/delete fail with 403 from GCS otherwise. No new
   env, secrets, buckets, or APIs — playback proxies the bytes through ADC and soft-delete reuses the
   same bucket. **Smoke test:** upload a clip via `/transmit` → it appears in `/admin/transmissions` →
   **play** streams → **keep** removes it from the queue (now under `kept/`) → **delete** on another
   moves it under `trash/`.
