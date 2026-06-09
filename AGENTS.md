# Village Radio — vlgfm.live

Agent guide for this repo. This is the single source of truth for **any** AI agent
or contributor (Claude Code, Cursor, Copilot, Codex, Gemini, etc.). `CLAUDE.md`
points here. Read this first, then read the design/component skills before touching UI.

A minimal cybercore creative hub: internet radio mixes, a "transmit" recorder, a
brand-design portfolio, and photography. Built for atmosphere, not features.

## Stack
- **Framework**: Next.js 16 (App Router), React 19, TypeScript (strict)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/postcss`) + CSS custom properties
- **Lint**: ESLint 9 (flat config `eslint.config.mjs`, `eslint-config-next`). Run it with
  `npm run lint` (= `eslint .`). **Do not use `next lint`** — it was removed in Next 16.
- **Audio hosting**: Cloudflare R2 (public bucket) for broadcast mixes; admin-uploaded images also
  live on R2 (under `photos/`/`work/` prefixes), served via `next/image` from the public URL
- **User uploads**: GCS (`TRANSMISSIONS_BUCKET`, private, via ADC) for `/transmit` submissions
- **Editable content**: JSON manifests in a private GCS bucket (`CONFIG_BUCKET`) — the admin panel's
  source of truth (see "Admin panel" below)
- **Deployment**: Cloud Run (containerized, Next.js `standalone`) via GitHub Actions + Workload
  Identity Federation; pushes to `main` deploy to production automatically
- **Domains**: `vlgfm.live` (canonical, in code) / `villageradio.xyz`

## Setup & environment
- **Node 20+** required (Next.js 16). No version is pinned in-repo; use your own
  version manager (`nvm`, `fnm`, `volta`, etc.).
- **Git LFS** — `.gitattributes` tracks `*.mp3` via LFS. The in-repo interlude files
  (`public/audio/inter_1.mp3`, `inter_2.mp3`) are LFS pointers. After cloning run
  `git lfs install` then `git lfs pull`, or you'll get text pointer files instead of
  audio. (Broadcast mixes themselves live in R2, not the repo — see below.)
- **`.env.local`** (gitignored) — only the vars for the parts you exercise locally:
  - `TRANSMISSIONS_BUCKET` — GCS bucket for `/api/transmissions`; auth via ADC
    (`gcloud auth application-default login`). The R2 bucket for mix playback is public (no read key).
  - Admin panel: `CONFIG_BUCKET` (GCS content manifests) + auth secrets (`ADMIN_USERNAME`,
    `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`) + R2 write creds (`R2_ACCOUNT_ID` / `R2_BUCKET` /
    `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`) for uploads. Unset `CONFIG_BUCKET` → pages serve the
    bundled seed. Full provisioning: `docs/admin-deployment-runbook.md`.
- Install: `npm install`.

## Commands
- `npm run dev` — start local dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — serve a production build locally
- `npm run lint` — run ESLint (`eslint .`; **not** `next lint`, removed in Next 16)
- `npx tsc --noEmit` — typecheck without emitting
- `npm test` — run the Vitest unit suite (`vitest run`)
- `node scripts/probe-durations.mjs` — probe MP3 durations from R2 (see "Adding mixes")
- `CONFIG_BUCKET=… node scripts/seed-content.mjs` — seed content manifests into GCS (admin; one-time)
- `node scripts/migrate-photos-to-r2.mjs --dry-run` — preview the one-time photo→R2 migration

## Cross-OS conventions
This repo targets macOS, Linux, and Windows. To keep agents portable:
- Prefer the **npm scripts above** over hand-written shell one-liners. They run
  identically on every OS.
- Use **forward slashes** in code/import paths; never hardcode platform-specific
  absolute paths.
- Don't assume a Unix shell (`bash`/`zsh`); don't rely on `sed`/`awk`/`grep` in
  committed scripts. The one helper script (`scripts/probe-durations.mjs`) is plain
  Node and runs everywhere.
- Keep line endings as **LF**. The repo doesn't force normalization, so configure
  your editor to LF and avoid mass CRLF churn.

## Routes (App Router — `src/app/`)
- `/` — Home: featured links, the `LissajousScope` canvas, a "send transmission"
  link, and a feature photograph.
- `/listen` — the radio view; renders the `SDRWaterfall` visualization.
- `/work` — brand-design portfolio grid, rendered from the `work.json` manifest (admin-editable).
- `/photography` — "Negative Series": a photo grid from the `photos.json` manifest; images resolve
  to R2 (`photos/` prefix), with a `/public/images/photography/negative/` fallback for bare keys.
- `/news` — editorial posts from the `news.json` manifest.
- `/information` — about page; renders Markdown from the `information.md` manifest (`CONFIG_BUCKET`),
  falling back to the bundled `public/information/info_page.md`.
- `/transmit` — record and send a short transmission (in-browser recorder + scope).
- Nav links to `listen / work / photography / news`; the logo toggles between `/`
  and `/information`; `/transmit` is linked from the home page.

### API routes (`src/app/api/`)
- `GET /api/audio/stream?file=<name>` — proxies a mix from R2 with Range support.
  Only filenames in the allowlist are served (see "Audio architecture").
- `POST /api/transmissions` — accepts `audio/webm` ≤ 5 MB, stores it privately in GCS
  (`TRANSMISSIONS_BUCKET`, via ADC) under `transmissions/new/…` (the moderation queue's inbox).
- `GET /api/time` — returns `{ t: <epoch ms> }` for client clock sync.
- `/api/admin/*` — the admin API (login/logout + per-section GET/PUT + uploads + transmissions
  moderation). Gated; see "Admin panel".
- All `/api/*` routes are rate-limited by `src/proxy.ts` (in-memory, per-instance fixed window; see
  `src/lib/rate-limit.ts`). `src/proxy.ts` is the Next 16 successor to `middleware.ts`.

## Audio architecture (important — easy to get wrong)
- **Broadcast mixes are hosted on Cloudflare R2**, not in the repo. They're streamed through the
  `/api/audio/stream` proxy so the bucket URL stays hidden and Range requests work.
- **The broadcast manifest (`content/broadcast.json` in `CONFIG_BUCKET`) is the single source of
  truth** — it superseded the old `src/lib/data/mixes.ts`, which was **deleted**. The `mixes` list and
  the stream proxy's filename allowlist are *derived* from it (`getBroadcastFiles()` /
  `src/lib/content/broadcast.ts`); never maintain a separate allowlist. Edit the lineup in
  `/admin/broadcast`. Until `CONFIG_BUCKET` is set, the bundled seed
  (`src/lib/content/seed/broadcast.json`) is used.
- **User transmissions are private in GCS** (`TRANSMISSIONS_BUCKET`), unrelated to mix playback; the
  admin moderation queue manages them (see "Admin panel").
- Filenames: mixes are `<color>_<MM-DD-YYYY>.mp3` (colors: `red` / `green` /
  `yellow`); interludes are `inter_<n>.mp3` with `kind: 'inter'`.
- **Adding a new mix → follow `docs/instructions.md`.**

## Admin panel
A hidden, authenticated console to edit all site content without a deploy (branch `adnan`, phases
0–6). Full design: `docs/superpowers/specs/2026-06-08-admin-panel-design.md`; provisioning + deploy:
`docs/admin-deployment-runbook.md`.

- **Entry & gating.** A client-side key sequence reveals a soot-sprite linking to an unguessable login
  path (`ADMIN_LOGIN_PATH`, default `/relay`). `src/proxy.ts` gates `/admin/*` + `/api/admin/*`: no
  valid session → rewrite to a 404 ("the panel doesn't exist"). Every admin route/page also calls
  `requireAdmin()` (`src/lib/auth/guard.ts`) — never trust the proxy gate alone.
- **Auth & session.** Single shared login: `ADMIN_USERNAME` + scrypt `ADMIN_PASSWORD_HASH` (Secret
  Manager), constant-time compared, login rate-limited. Stateless HMAC session cookie
  (httpOnly/Secure/SameSite=Strict) signed with `SESSION_SECRET`. Mutations also check `sameOrigin`.
- **Content store.** Editable content = versioned JSON manifests in `CONFIG_BUCKET`
  (`src/lib/content/store.ts`): broadcast, photos, work, news, + `information.md`. Admin reads live;
  public pages read a cached loader and bust the tag on Publish; optimistic concurrency via
  `ifGenerationMatch`.
- **Media.** Audio + images upload to R2 (`src/lib/storage/r2.ts`); images under `photos/`/`work/`.
- **Transmissions moderation.** `/admin/transmissions` lists/plays/keeps/deletes user uploads; state
  is encoded by GCS prefix (`transmissions/new|kept|trash/`), no manifest; playback proxies the
  private bytes via `/api/admin/transmissions/audio`.
- **Sections:** `/admin/{broadcast,photography,work,news,information,transmissions}` (settings is a
  future item).

## Code conventions
- TypeScript strict — no `any`.
- Components: functional, **named** exports.
- File names: kebab-case for pages/components.
- Tailwind for layout/spacing; CSS custom properties for design tokens.
- No inline styles except for genuinely dynamic values.

### Quality bar (do this every time)
- **Lint and typecheck before you're done.** Run `npm run lint` and `npx tsc --noEmit`
  and fix everything before claiming a change is complete. Don't hand back code that
  fails either.
- **Follow the existing style.** Match the conventions, naming, and formatting of the
  surrounding code and the rules above. Don't introduce new patterns, libraries, or
  tooling without a clear reason — read the design/component skills first.
- **Keep it concise.** Prefer the boring, obvious solution. No speculative
  abstractions, no dead code, no commented-out blocks left behind.
- **AVOID DUPLICATION.** Don't copy logic, data, or config — derive or share it. This
  repo already does this deliberately: `mixes.ts` is the single source of truth and the
  stream allowlist + `mixes` list are *derived* from it; design tokens live only in
  `globals.css`; design/component docs live only in the skills. Before adding
  something, check whether it already exists and reuse it.
- Never use `--no-verify`, never disable tests to make them pass, never commit code
  that doesn't lint, typecheck, or build.

## Design & components
Design and component guidance lives in skills so it isn't duplicated here. **Before
building or changing any UI, read both:**
- `.claude/skills/design.md` — aesthetic, color tokens, typography, motion, the
  "Absolute Don'ts" list.
- `.claude/skills/components.md` — component architecture, data shapes, audio player,
  performance notes.

The authoritative **design tokens live in `src/app/globals.css`** (e.g. background
`#080808`, text `#e8e4d9`, signal `#4a9e4a`). If a skill and `globals.css` ever
disagree, `globals.css` wins — update the skill.

## Git workflow
- Branch off `main`; open a PR. **Do not push directly to `main`** unless you mean to
  ship — `main` auto-deploys to Cloud Run production (GitHub Actions + Workload Identity Federation).
- The active development branch is `adnan`.
- Commit working code incrementally; only commit/push when the user asks.
