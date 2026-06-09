# Admin Panel — Deployment Runbook

A **follow-along checklist** to provision everything the hidden admin panel needs and ship it to
production. Do the steps **in order**. This is the operational companion to the design spec
(`docs/superpowers/specs/2026-06-08-admin-panel-design.md` — read §5 for the security model, §14.1
for the env-var reference table); this runbook is the authoritative *how*.

> **Who does what** (see the team split): **Adnan** owns the **GCP** project (buckets, Secret
> Manager, IAM). **Ameen** owns the **GitHub repo** (Actions `vars`, merging to `main`). Steps note
> which hat is needed.

## How the app reads config (mental model)

The deploy workflow (`.github/workflows/deploy.yml`) runs `gcloud run deploy` and injects config two
ways:

- **`--set-env-vars`** → plain config: `TRANSMISSIONS_BUCKET`, `CONFIG_BUCKET` (sourced from GitHub
  Actions **`vars`** `GCP_TRANSMISSIONS_BUCKET` / `GCP_CONFIG_BUCKET`).
- **`--set-secrets`** → sensitive values mounted from **Secret Manager** at runtime (never in the
  repo, never plaintext env). Currently: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`.

So provisioning = "create the secrets/buckets, grant the runtime service account access, set the
GitHub `vars`, make sure `deploy.yml` references each secret, then push to `main`."

Concrete project values referenced below (confirm against your project):

| Thing | Value |
|---|---|
| GCP project | `village-radio` |
| Runtime service account (the app's identity) | `vlgfm-run@village-radio.iam.gserviceaccount.com` |
| Config bucket | `vlg-config-village-radio` |
| Transmissions bucket | *(your existing `TRANSMISSIONS_BUCKET`)* |
| Public R2 base (image/audio reads) | `https://pub-…r2.dev` |

Throughout, `gcloud` assumes you've run `gcloud auth login` and `gcloud config set project
village-radio` (Adnan).

---

## A. One-time prerequisites

These are already in place from the GCP migration — **verify**, don't recreate.

1. **Cloud Run + WIF deploy is wired.** `deploy.yml` authenticates via Workload Identity Federation
   using GitHub Actions `vars`: `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`, plus `GCP_SERVICE`,
   `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_RUNTIME_SA`.
   **Verify (Ameen, repo → Settings → Secrets and variables → Actions → Variables):** all six exist.
   **Verify (Adnan):** `gcloud run services describe "$GCP_SERVICE" --region "$GCP_REGION"` returns a
   service running as `vlgfm-run@…`.
2. **`gcloud` + ADC for local/admin scripts (Adnan).** Install the gcloud CLI; then
   `gcloud auth login` and — for running the seed/migrate scripts locally —
   `gcloud auth application-default login` (this is what `@google-cloud/storage` uses as ADC).

---

## B. Secrets & env (Adnan: Secret Manager · Ameen: GitHub vars)

Each secret is created once in Secret Manager, then referenced by `deploy.yml`'s `--set-secrets`.
Create a secret + first version like:

```bash
# generic pattern — pipe the value in, never pass it as a shell arg that lands in history
printf '%s' 'THE_VALUE' | gcloud secrets create SECRET_NAME --data-file=-
# to rotate later: add a new version
printf '%s' 'NEW_VALUE' | gcloud secrets versions add SECRET_NAME --data-file=-
```

3. **`ADMIN_USERNAME`** — the admin login name. *Why:* compared (constant-time) in the login route.
   *Value:* you choose it (not an email; keep it non-obvious).
   ```bash
   printf '%s' 'pick-a-username' | gcloud secrets create ADMIN_USERNAME --data-file=-
   ```
4. **`ADMIN_PASSWORD_HASH`** — the scrypt hash of the admin passphrase. *Why:* the panel never stores
   the plaintext password; the login route verifies against this hash. *How to get the value:* run
   the repo helper locally with a strong passphrase and copy its **entire** `scrypt$…` line:
   ```bash
   node scripts/hash-password.mjs 'a long random passphrase you keep in your password manager'
   # → scrypt$16384$8$1$<saltB64url>$<keyB64url>
   printf '%s' 'scrypt$16384$8$1$…' | gcloud secrets create ADMIN_PASSWORD_HASH --data-file=-
   ```
   Store the passphrase itself in your password manager; it is never committed or uploaded.
5. **`SESSION_SECRET`** — the HMAC key that signs session cookies. *Why:* a long random secret makes
   session tokens unforgeable; rotating it (new version) logs everyone out. *How to get the value:*
   generate a long random string:
   ```bash
   openssl rand -base64 48
   printf '%s' '<that random string>' | gcloud secrets create SESSION_SECRET --data-file=-
   ```
6. **Grant the runtime SA read access to the secrets (Adnan).** *Why:* Cloud Run mounts the secrets
   as the runtime SA; without `secretAccessor` the container fails to start and the panel is
   unreachable. Grant per secret (or at project level):
   ```bash
   for S in ADMIN_USERNAME ADMIN_PASSWORD_HASH SESSION_SECRET; do
     gcloud secrets add-iam-policy-binding "$S" \
       --member="serviceAccount:vlgfm-run@village-radio.iam.gserviceaccount.com" \
       --role="roles/secretmanager.secretAccessor"
   done
   ```
7. **(Optional) session/obscurity env** — defaults are fine; only set these to change behaviour:
   `SESSION_VERSION` (bump to revoke all sessions), `SESSION_TTL_MS` (default 8h), `ADMIN_LOGIN_PATH`
   (default `/relay`). *Note:* these are **not** wired in `deploy.yml` yet — to use one, add it to the
   `--set-env-vars` list (see the diff in step 12).

---

## C. Buckets & IAM (Adnan)

8. **Config bucket** — holds the editable content manifests (`content/*.json`, `information.md`).
   *Why:* the admin "Publish" buttons and all public pages read/write here; without it, edits can't
   persist. Create it with **object versioning** (free edit history + one-click rollback), uniform
   bucket-level access, and public-access-prevention:
   ```bash
   gcloud storage buckets create gs://vlg-config-village-radio \
     --location=<your-region> --uniform-bucket-level-access --public-access-prevention
   gcloud storage buckets update gs://vlg-config-village-radio --versioning
   ```
   Then **(Ameen)** set GitHub Actions var `GCP_CONFIG_BUCKET=vlg-config-village-radio`.
9. **Grant the runtime SA object access on BOTH content buckets (Adnan).** *Why:* admin writes
   (publish) and the transmissions moderation queue (**list/copy/delete**) go through ADC as the
   runtime SA; reads/writes 403 otherwise. The transmissions bucket previously only needed *create*
   (the public upload) — moderation adds list/move/delete, so it needs `objectAdmin` too:
   ```bash
   for B in vlg-config-village-radio "<TRANSMISSIONS_BUCKET>"; do
     gcloud storage buckets add-iam-policy-binding "gs://$B" \
       --member="serviceAccount:vlgfm-run@village-radio.iam.gserviceaccount.com" \
       --role="roles/storage.objectAdmin"
   done
   ```
   **(Ameen)** confirm the GitHub var `GCP_TRANSMISSIONS_BUCKET` matches the real bucket name.

---

## D. Media credentials — Cloudflare R2 (Adnan)

Audio mixes and admin-uploaded images live on **Cloudflare R2** (free egress), written via the S3
API. Reads are public (the hardcoded `pub-…r2.dev` URL) and need no creds; only **writes**
(audio/image uploads + the one-time photo migration) need a token.

10. **Create an R2 S3-API token** (Cloudflare dashboard → **R2** → *Manage R2 API Tokens* → *Create
    API Token*, permission **Object Read & Write**). Capture the four values:
    - `R2_ACCOUNT_ID` — your Cloudflare **Account ID** (R2 overview page / dashboard URL).
    - `R2_BUCKET` — the R2 bucket name. **Critical:** it must be the **same bucket bound to the public
      `pub-…r2.dev` URL** the app reads from; otherwise an upload "succeeds" somewhere reads can't see
      it and audio/images 404. Confirm in R2 → your bucket → Settings → Public access.
    - `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — shown **once** at token creation; copy both now.
    Create the four secrets:
    ```bash
    for kv in R2_ACCOUNT_ID=… R2_BUCKET=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=…; do
      printf '%s' "${kv#*=}" | gcloud secrets create "${kv%%=*}" --data-file=-
      gcloud secrets add-iam-policy-binding "${kv%%=*}" \
        --member="serviceAccount:vlgfm-run@village-radio.iam.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor"
    done
    ```
11. **⚠️ Wire the R2 secrets into the deploy (currently MISSING).** `deploy.yml`'s `--set-secrets`
    lists only the three auth secrets, so even after step 10 the running app has **no** R2 creds and
    every audio/image upload fails. Add the four to the `--set-secrets` line:

    ```diff
    --set-secrets "ADMIN_USERNAME=ADMIN_USERNAME:latest,ADMIN_PASSWORD_HASH=ADMIN_PASSWORD_HASH:latest,SESSION_SECRET=SESSION_SECRET:latest\
    -" \
    +,R2_ACCOUNT_ID=R2_ACCOUNT_ID:latest,R2_BUCKET=R2_BUCKET:latest,R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest,R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest" \
    ```
    (Edit `.github/workflows/deploy.yml`, line 39. If you also set any optional env from step 7, add
    it to the `--set-env-vars` on line 38, e.g. `,ADMIN_LOGIN_PATH=/your-path`.)

---

## E. Seed, migrate, deploy & smoke-test

12. **Seed the content manifests (Adnan, once).** *Why:* until seeded, public pages fall back to the
    bundled seed; seeding creates the live objects so admin edits have something to write to.
    ```bash
    CONFIG_BUCKET=vlg-config-village-radio node scripts/seed-content.mjs
    ```
    (Idempotent; `--force` overwrites existing objects. Tiny payloads — the VPN→Google hang shouldn't
    apply; if it does, run from Cloud Shell.)
13. **Migrate the 41 in-repo photos to R2 (Adnan, once, after step 10).** *Why:* moves the bundled
    photos to R2 so they serve via `next/image`; until then the resolver serves them from `/public`
    (nothing breaks either way). Preview first (no creds needed), then run with the R2 creds:
    ```bash
    node scripts/migrate-photos-to-r2.mjs --dry-run
    R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… \
      node scripts/migrate-photos-to-r2.mjs
    ```
    Then open `/admin/photography` and **Publish** so the prefixed `photos/…` keys land in the live
    manifest.
14. **Deploy (Ameen).** Merge `adnan` → `main` (or push to `main`). The `deploy` workflow builds the
    container and runs `gcloud run deploy`. *Why last:* the app reads the secrets/env/buckets created
    above at startup; deploying earlier fails closed.
15. **Smoke-test (anyone, in prod).**
    - Visit the site → trigger the hidden entry (key sequence → soot sprite) → land on the login at
      `ADMIN_LOGIN_PATH` (default `/relay`). Visiting `/admin` directly **without a session must
      404**.
    - Log in → each section loads. **Broadcast:** upload a small `.mp3` → `GET https://pub-…r2.dev/<returned
      file>` is `200` → add to lineup → Publish → it streams via `/api/audio/stream`.
    - **Photography:** upload a `.jpg` → `GET https://pub-…r2.dev/photos/<key>` is `200` → Publish →
      renders on `/photography`.
    - **Transmissions:** record a clip at `/transmit` → it appears in `/admin/transmissions` → **play**
      streams → **keep** moves it to `kept/` (drops from queue) → **delete** on another moves it to
      `trash/`.

---

## Quick reference — what gates what

| To use… | You need (steps) |
|---|---|
| The panel to exist at all (login + gate) | 3, 4, 5, 6 + deploy (14) |
| Content edit/publish (broadcast order, photo/work/news metadata, information) | 8, 9 + 12 |
| Audio upload **and** image upload + the photo migration | 10, **11** |
| Transmissions moderation (list/play/keep/delete) | 9 (objectAdmin on `TRANSMISSIONS_BUCKET`) |

**Rotations / break-glass:** rotate `SESSION_SECRET` (add a Secret Manager version) **or** bump
`SESSION_VERSION` to invalidate all live sessions. Content history/rollback = restore a prior object
**generation** in the versioned config bucket.
