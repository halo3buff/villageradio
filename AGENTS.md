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
- **Audio hosting**: Cloudflare R2 (public bucket) for broadcast mixes
- **User uploads**: Vercel Blob (private) for `/transmit` submissions
- **Deployment**: Vercel — pushes to `main` deploy to production automatically
- **Domains**: `vlgfm.live` (canonical, in code) / `villageradio.xyz`

## Setup & environment
- **Node 20+** required (Next.js 16). No version is pinned in-repo; use your own
  version manager (`nvm`, `fnm`, `volta`, etc.).
- **Git LFS** — `.gitattributes` tracks `*.mp3` via LFS. The in-repo interlude files
  (`public/audio/inter_1.mp3`, `inter_2.mp3`) are LFS pointers. After cloning run
  `git lfs install` then `git lfs pull`, or you'll get text pointer files instead of
  audio. (Broadcast mixes themselves live in R2, not the repo — see below.)
- **`.env.local`** (gitignored) needs:
  - `BLOB_READ_WRITE_TOKEN` — Vercel Blob token, used by `/api/transmissions`.
  - The R2 bucket for mix playback is public; no key is needed to read it.
- Install: `npm install`.

## Commands
- `npm run dev` — start local dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — serve a production build locally
- `npm run lint` — run ESLint (`eslint .`; **not** `next lint`, removed in Next 16)
- `npx tsc --noEmit` — typecheck without emitting
- `node scripts/probe-durations.mjs` — probe MP3 durations from R2 (see "Adding mixes")

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
- `/work` — brand-design portfolio grid (currently a placeholder grid).
- `/photography` — "Negative Series": a deterministically-scattered photo grid from
  `public/images/photography/negative/`.
- `/news` — editorial posts (hardcoded array in the page for now).
- `/information` — about page; renders Markdown from `public/information/info_page.md`.
- `/transmit` — record and send a short transmission (in-browser recorder + scope).
- Nav links to `listen / work / photography / news`; the logo toggles between `/`
  and `/information`; `/transmit` is linked from the home page.

### API routes (`src/app/api/`)
- `GET /api/audio/stream?file=<name>` — proxies a mix from R2 with Range support.
  Only filenames in the allowlist are served (see "Audio architecture").
- `POST /api/transmissions` — accepts `audio/webm` ≤ 5 MB, stores it privately in
  Vercel Blob under `transmissions/…`. Requires `BLOB_READ_WRITE_TOKEN`.
- `GET /api/time` — returns `{ t: <epoch ms> }` for client clock sync.
- All `/api/*` routes are rate-limited by `src/middleware.ts` (in-memory,
  per-instance fixed window; see `src/lib/rate-limit.ts`).

## Audio architecture (important — easy to get wrong)
- **Broadcast mixes are hosted on Cloudflare R2**, not in the repo and not in Vercel
  Blob. They're streamed through the `/api/audio/stream` proxy so the bucket URL
  stays hidden and Range requests work.
- **`src/lib/data/mixes.ts` is the single source of truth.** `broadcastPlaylist`
  defines the lineup; `mixes` is the mix-only filter; `broadcastFiles` is the deduped
  filename list. The stream proxy's allowlist is *derived from `broadcastFiles`* — so
  **adding a track to `mixes.ts` is all that's needed** to make it both playable and
  proxyable. Do not maintain a separate allowlist.
- **Vercel Blob is only for `/transmit` uploads** (user-submitted webm, stored
  private). It is unrelated to mix playback.
- Filenames: mixes are `<color>_<MM-DD-YYYY>.mp3` (colors: `red` / `green` /
  `yellow`); interludes are `inter_<n>.mp3` with `kind: 'inter'`.
- **Adding a new mix → follow `docs/instructions.md`.**

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
  ship — `main` auto-deploys to Vercel production.
- The active development branch is `adnan`.
- Commit working code incrementally; only commit/push when the user asks.
