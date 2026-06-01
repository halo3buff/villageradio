# Village Radio — Vercel → GCP Migration Runbook

**Audience:** an AI coding agent (Claude Code, Cursor, Codex, Gemini, …) driving a CLI on
the owner's machine, with the owner available to approve irreversible steps.
**Goal:** move hosting, build, CI/CD, and `/transmit` storage to Google Cloud Platform
with **no interruption to the current Vercel auto-deploy** and **little-to-no site
downtime**, while keeping the domains `vlgfm.live` and `villageradio.xyz`.

This runbook is the single source of truth for the migration. Execute the phases **in
order**. Each phase ends with a **VERIFY** gate you must pass before continuing, and a
**ROLLBACK** note. Two steps are irreversible and require explicit owner sign-off; they
are marked **🛑 HUMAN GATE**.

---

## 0. How to use this runbook (read first)

Operating rules for the executing agent:

1. **Do the phases in order.** Do not start a phase until the previous phase's VERIFY
   gate passed.
2. **Never skip a VERIFY gate.** Paste the command output back to the owner if anything
   is ambiguous.
3. **Stop after 3 failed attempts** at any step and reassess with the owner rather than
   improvising around a failure.
4. **Two things break silently if you forget them** (both are handled below — do not
   remove them):
   - The interlude audio `public/audio/inter_*.mp3` are **Git LFS pointers**. Every build
     context must contain the *real* files, so CI uses `actions/checkout` with `lfs: true`
     and local builds require `git lfs pull` first.
   - `.gitignore` ignores `public/audio/`. `gcloud` falls back to `.gitignore` when no
     `.gcloudignore` exists, which would **exclude the interludes from the build**. The
     repo therefore ships an explicit `.gcloudignore` (Phase 3) that keeps `public/audio`.
5. **Do not touch `main` until Phase 8 (cutover).** Vercel auto-deploys `main`; keeping
   `main` unchanged is what keeps Vercel uninterrupted during the parallel build. All
   migration code lives on the `gcp-migration` branch and is deployed to Cloud Run
   manually / via `workflow_dispatch` until cutover.
6. **🛑 HUMAN GATE** steps (DNS flip in Phase 8, Vercel teardown in Phase 9) require the
   owner to say "go" before you run them.
7. Shell snippets assume **bash/zsh on macOS or Linux** (the owner is on macOS/zsh). On
   Windows use the PowerShell equivalents (`$env:VAR="…"` instead of `export`).

### What changes vs. what stays the same

| Stays exactly as-is (do not modify) | Changes in this migration |
|---|---|
| Cloudflare R2 mix hosting + `/api/audio/stream` proxy | Host: Vercel → **Cloud Run** |
| `src/lib/data/mixes.ts` (single source of truth) | TLS/domain/edge → **Global External App Load Balancer** |
| In-memory rate limiter + `src/middleware.ts` | Build → **Cloud Build** + **Artifact Registry** |
| All pages and the R2 base URL constant | CI/CD → **GitHub Actions + Workload Identity Federation** |
| Canonical domain `vlgfm.live` in `layout.tsx` (`metadataBase`) | `/transmit` storage: Vercel Blob → **private GCS bucket** |

---

## Variables

Set these once at the top of every shell session (fill in the blanks first). Everything
below references them.

```bash
# --- Identity / project ---
export PROJECT_ID="village-radio-prod"          # create or reuse; must be globally unique
export REGION="us-central1"                       # pick the region nearest your audience
export GITHUB_REPO="OWNER/villageradio"          # set to the real GitHub owner/repo

# --- Names (safe defaults; change only if you have a reason) ---
export SERVICE="vlgfm"                            # Cloud Run service name
export RUNTIME_SA="vlgfm-run"                      # Cloud Run runtime service account (id)
export DEPLOYER_SA="vlgfm-deployer"                # CI deploy service account (id)
export TRANSMISSIONS_BUCKET="vlg-transmissions-$PROJECT_ID"  # globally-unique GCS bucket
export WIF_POOL="github-pool"
export WIF_PROVIDER="github-provider"
export LB_IP_NAME="vlg-ip"
export AR_REPO="cloud-run-source-deploy"          # repo name used by `gcloud run deploy --source`

# --- Domains ---
export DOMAINS="vlgfm.live,www.vlgfm.live,villageradio.xyz,www.villageradio.xyz"
export TEST_SUBDOMAIN="gcp.vlgfm.live"             # temporary, for pre-cutover validation

# --- Team (second admin) — see "Team access" section ---
export TEAMMATE_EMAIL="teammate@example.com"       # teammate's Google account (GCP IAM)
export TEAMMATE_GH_USER="teammate-github-handle"   # teammate's GitHub username

# --- Derived (populated after the project exists) ---
export PROJECT_NUMBER=""   # gcloud projects describe $PROJECT_ID --format='value(projectNumber)'
```

Full service-account emails (used throughout):

- Runtime SA: `${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com`
- Deployer SA: `${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com`

---

## Prerequisites

Confirm before Phase 1 (VERIFY each):

- **Tooling installed:** `gcloud --version`, `gh --version`, `node --version` (20+),
  `git --version`, `git lfs version`.
- **Authenticated:** `gcloud auth login` (owner account with project/billing rights);
  `gh auth status` (write access to `$GITHUB_REPO`).
- **Billing:** a billing account exists and can be linked to `$PROJECT_ID`.
- **Access you need from the owner:** Namecheap DNS login (for the Phase 8 flip), the
  Vercel project (for Phase 7 Blob export + Phase 9 teardown), and confirmation that the
  GCP org (if any) allows `allUsers` as a Cloud Run invoker (a personal/no-org project is
  fine; an org with "Domain Restricted Sharing" must allow it for `--allow-unauthenticated`).
- **Working with a teammate?** See the **"Team access"** section after Phase 1 to grant a
  second admin on GCP, GitHub, DNS, Vercel, and Cloudflare R2. Fill in `TEAMMATE_EMAIL` and
  `TEAMMATE_GH_USER` in the Variables block.
- **Current DNS recorded:** save the existing Namecheap records for both domains
  (screenshot or `dig`) so rollback is exact:
  ```bash
  for d in vlgfm.live www.vlgfm.live villageradio.xyz www.villageradio.xyz; do
    echo "== $d =="; dig +short "$d" A; dig +short "$d" CNAME;
  done
  ```

---

## Phase 1 — GCP project bootstrap

**Create/select the project and link billing:**

```bash
gcloud projects create "$PROJECT_ID" 2>/dev/null || echo "project exists, reusing"
gcloud config set project "$PROJECT_ID"
gcloud billing accounts list                      # find the account id
# gcloud billing projects link "$PROJECT_ID" --billing-account=XXXXXX-XXXXXX-XXXXXX
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
echo "PROJECT_NUMBER=$PROJECT_NUMBER"
```

**Enable required APIs:**

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  compute.googleapis.com \
  storage.googleapis.com
```

**Create the Artifact Registry repo** (the name `gcloud run deploy --source` expects):

```bash
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker --location="$REGION" \
  --description="Cloud Run source-deploy images"
```

**Create the two service accounts (least privilege):**

```bash
gcloud iam service-accounts create "$RUNTIME_SA"  --display-name="Cloud Run runtime (vlgfm)"
gcloud iam service-accounts create "$DEPLOYER_SA" --display-name="CI deployer (vlgfm)"
```

**Grant the deployer the roles it needs to build + deploy:**

```bash
RUNTIME_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

for ROLE in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/storage.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOYER_EMAIL}" --role="$ROLE" --condition=None
done

# Allow the deployer to deploy the Cloud Run service *as* the runtime SA:
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_EMAIL" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" --role="roles/iam.serviceAccountUser"
```

> `roles/storage.admin` here is for the Cloud Build source-staging bucket. You may tighten
> it later to just that bucket (`gs://${PROJECT_ID}_cloudbuild`).

**Ensure the Cloud Build builder SA can push images.** `gcloud run deploy --source` runs
the build as a Cloud Build service account; grant it Artifact Registry write (covers both
the legacy Cloud Build SA and the newer Compute-default build SA):

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer" --condition=None 2>/dev/null || true
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.writer" --condition=None 2>/dev/null || true
```

**VERIFY:**
```bash
gcloud services list --enabled --format='value(config.name)' | sort
gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --format='value(name)'
gcloud iam service-accounts list --format='table(email)'
```
Expect all 8 APIs enabled, the AR repo present, and both service accounts listed.

**ROLLBACK:** nothing is serving traffic yet. To fully undo: delete the service accounts
and AR repo, or delete the project (`gcloud projects delete $PROJECT_ID`).

---

## Team access — add your teammate as a second admin

> Run this right after Phase 1 (the GCP project now exists) so **both** of you can drive
> the rest of the migration. The GitHub / Vercel / Cloudflare parts don't depend on GCP and
> can be done at any time.
>
> **Owner vs. admin — what makes the difference:** the teammate becomes a full **project
> admin** but the **literal owner stays distinct by holding two things the teammate is not
> granted**: (1) **Billing Account Administrator** (granted on the *billing account*, not
> the project) and (2) registrar/account ownership (Namecheap, the GitHub repo/org owner,
> the Cloudflare account). That separation is what lets the teammate manage and deploy
> everything without being able to control billing or delete the account.
>
> **Security posture:** each human authenticates with **their own** Google + GitHub
> identity. There are **no shared passwords and no shared service-account JSON keys** — CI
> uses Workload Identity Federation (Phase 5), and local work uses each person's own
> `gcloud auth login` / `gcloud auth application-default login`.

### 1. GCP project — make the teammate an admin

**Recommended (simple): grant project Owner**, while billing stays with the literal owner.

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="user:${TEAMMATE_EMAIL}" --role="roles/owner" --condition=None

# (Optional) let them SEE spend without administering billing:
# gcloud billing accounts add-iam-policy-binding <BILLING_ACCOUNT_ID> \
#   --member="user:${TEAMMATE_EMAIL}" --role="roles/billing.viewer"
```

**Least-privilege alternative** — full operational admin *without* a second project Owner
(can deploy, manage all migration resources, and grant resource-level IAM, but cannot
take over billing or delete the project):

```bash
for ROLE in \
  roles/run.admin \
  roles/compute.admin \
  roles/artifactregistry.admin \
  roles/storage.admin \
  roles/cloudbuild.builds.editor \
  roles/iam.serviceAccountAdmin \
  roles/iam.serviceAccountUser \
  roles/iam.workloadIdentityPoolAdmin \
  roles/resourcemanager.projectIamAdmin \
  roles/serviceusage.serviceUsageAdmin ; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="user:${TEAMMATE_EMAIL}" --role="$ROLE" --condition=None
done
```

> Both of you can now run every `gcloud` command in this runbook (deploys, the load
> balancer, the bucket, WIF) under your own identity. Local `/transmit` testing and manual
> Cloud Run deploys work for each of you via your own ADC — no key sharing.

### 2. GitHub repo — admin collaborator

Both of you push to `main`, and CI (WIF) deploys regardless of who pushed.

```bash
# Personal repo: add as an admin collaborator
gh api -X PUT "/repos/${GITHUB_REPO}/collaborators/${TEAMMATE_GH_USER}" -f permission=admin
# Org repo instead: add them to a team with Admin on the repo, e.g.
# gh api -X PUT "/orgs/<ORG>/teams/<TEAM_SLUG>/repos/${GITHUB_REPO}" -f permission=admin
```

The teammate accepts the invite (`gh repo view ${GITHUB_REPO}` after accepting). No GCP
keys are added to GitHub — WIF is already scoped to the **repo**, so the teammate's pushes
deploy through the same provider.

### 3. DNS (Namecheap) — give DNS control without sharing the login

Namecheap has limited multi-user support, so don't share the registrar password. Pick one:

- **Simplest:** the literal owner performs the few DNS edits in Phases 6 and 8 (only a
  handful of record changes total). The teammate prepares the exact records to set.
- **Better for shared ops — delegate DNS to Cloud DNS:** create a Cloud DNS managed zone
  for each domain and switch the domain's **nameservers** at Namecheap to Google's. After
  that, *both* admins manage records via GCP IAM (`roles/dns.admin`), no Namecheap login
  needed. Do this **before** Phase 6 if you want it, since it changes where records live:
  ```bash
  gcloud services enable dns.googleapis.com
  gcloud dns managed-zones create vlgfm-live --dns-name="vlgfm.live." --description="vlgfm"
  gcloud dns managed-zones describe vlgfm-live --format='value(nameServers)'   # set these at Namecheap
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="user:${TEAMMATE_EMAIL}" --role="roles/dns.admin" --condition=None
  ```
  If you delegate, recreate the existing records (the Vercel ones, until cutover) in the
  Cloud DNS zone first so nothing drops, then proceed with Phases 6/8 editing Cloud DNS
  instead of Namecheap. (The literal owner still owns the domain registration at Namecheap.)

### 4. Vercel (temporary — until Phase 9)

So the teammate can help validate the current site, grab the Blob token (Phase 7), and
assist with teardown (Phase 9): in the Vercel dashboard, **Team/Project → Settings →
Members → Invite** the teammate as a Member (or Admin). This access goes away when the
Vercel project is deleted in Phase 9.

### 5. Cloudflare R2 (ongoing — mixes stay here)

Mixes remain on R2 after the migration, so the teammate needs lasting access to manage the
bucket. In the Cloudflare dashboard: **Account → Members → Invite** the teammate, with a
role that includes **R2 admin** (or scope an API token to the mixes bucket if you prefer
token-based access for tooling).

**VERIFY team access:**
```bash
# GCP: teammate appears with admin role(s)
gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten="bindings[].members" \
  --filter="bindings.members:${TEAMMATE_EMAIL}" \
  --format='table(bindings.role)'
# GitHub: teammate listed as admin collaborator
gh api "/repos/${GITHUB_REPO}/collaborators/${TEAMMATE_GH_USER}/permission" --jq .permission
```
Have the teammate confirm independently: `gcloud auth login` (their account) →
`gcloud run services list --project "$PROJECT_ID"` returns the service, and they can see
the repo in `gh repo list`.

---

## Phase 2 — Private GCS bucket for `/transmit` uploads

```bash
gcloud storage buckets create "gs://${TRANSMISSIONS_BUCKET}" \
  --location="$REGION" \
  --uniform-bucket-level-access \
  --public-access-prevention

# Runtime SA may read/write objects in this bucket only:
gcloud storage buckets add-iam-policy-binding "gs://${TRANSMISSIONS_BUCKET}" \
  --member="serviceAccount:${RUNTIME_EMAIL}" --role="roles/storage.objectAdmin"
```

**VERIFY:**
```bash
gcloud storage buckets describe "gs://${TRANSMISSIONS_BUCKET}" \
  --format='value(name,iamConfiguration.publicAccessPrevention,iamConfiguration.uniformBucketLevelAccess.enabled)'
```
Expect `enforced` public-access-prevention and uniform access `True`.

**ROLLBACK:** `gcloud storage rm --recursive gs://${TRANSMISSIONS_BUCKET}` (bucket is empty
at this point).

---

## Phase 3 — Containerization code changes (branch `gcp-migration`)

> Do all of this on a branch. **Do not merge to `main`** — merging the GCS route change to
> `main` now would make `/transmit` fail on the live Vercel site (Vercel has no GCP creds).
> `main` stays on Vercel/Blob until cutover (Phase 8).

```bash
git checkout main && git pull
git checkout -b gcp-migration
git lfs install && git lfs pull        # materialize the real interlude MP3s locally
```

Apply the following changes. Full file contents are in **Appendix A**.

1. **`next.config.ts`** — add `output: 'standalone'` (slim Cloud Run image).
2. **`src/app/api/transmissions/route.ts`** — replace `@vercel/blob` with
   `@google-cloud/storage`; read the bucket from `process.env.TRANSMISSIONS_BUCKET`; fail
   fast if it's unset. Validation, 5 MB cap, key scheme, and `{ ok }` response are
   unchanged. (Keep the `@vercel/blob` dependency installed until Phase 9 so `main`/Vercel
   keeps working in parallel; only the import in this file moves to GCS.)
3. **`package.json`** — add `@google-cloud/storage`:
   ```bash
   npm install @google-cloud/storage
   ```
4. **`Dockerfile`** — new (Appendix A).
5. **`.dockerignore`** — new (Appendix A). Does **not** exclude `public/`.
6. **`.gcloudignore`** — new (Appendix A). Does **not** exclude `public/audio`.

**Build and run locally to verify the container is correct:**

```bash
# Local dev still works against the bucket using your own credentials:
gcloud auth application-default login
echo "TRANSMISSIONS_BUCKET=$TRANSMISSIONS_BUCKET" >> .env.local   # for `npm run dev`
npm run build      # must succeed with the standalone output
npm run lint
npx tsc --noEmit
```

Optional but recommended — build the actual image locally (catches LFS/.dockerignore
mistakes before you ever touch GCP):

```bash
docker build -t vlgfm-local .
docker run --rm -p 8080:8080 \
  -e TRANSMISSIONS_BUCKET="$TRANSMISSIONS_BUCKET" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/tmp/adc.json \
  -v "$HOME/.config/gcloud/application_default_credentials.json:/tmp/adc.json:ro" \
  vlgfm-local
# In another terminal: curl -I http://localhost:8080  → 200
# Confirm an interlude is real audio, not a 132-byte LFS pointer:
curl -sI http://localhost:8080/audio/inter_1.mp3 | grep -i content-length
```

Commit the branch:

```bash
git add -A && git commit -m "feat: containerize for Cloud Run + move /transmit uploads to GCS"
git push -u origin gcp-migration
```

**VERIFY:** `npm run build` succeeds; `inter_1.mp3` served from the container is **>> 132
bytes** (real audio, proving LFS + `.gcloudignore` are correct); typecheck and lint pass.

**ROLLBACK:** branch-only changes; `git checkout main` to abandon. Nothing deployed.

---

## Phase 4 — First manual Cloud Run deploy (validate the app)

Deploy the **branch** to Cloud Run by hand (this uses Cloud Build under the hood via
`--source`):

```bash
git checkout gcp-migration && git lfs pull       # ensure real MP3s in the build context
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$RUNTIME_EMAIL" \
  --set-env-vars "TRANSMISSIONS_BUCKET=${TRANSMISSIONS_BUCKET}" \
  --allow-unauthenticated \
  --min-instances 1 --max-instances 4 \
  --cpu 1 --memory 512Mi \
  --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo "$SERVICE_URL"
```

> `--min-instances 1` avoids cold starts and keeps the in-memory rate limiter meaningful.
> Adjust `--max-instances` for budget. The Next.js standalone server listens on the
> `PORT` Cloud Run injects (8080).

**VERIFY** against `$SERVICE_URL`:
```bash
curl -I "$SERVICE_URL"                                   # 200
curl -I "$SERVICE_URL/listen"                            # 200
curl -sI "$SERVICE_URL/audio/inter_1.mp3" | grep -i content-length   # real audio, not 132B
# A mix streams through the R2 proxy (pick a real filename from src/lib/data/mixes.ts):
curl -sI "$SERVICE_URL/api/audio/stream?file=<known.mp3>" | head
```
Then in a browser: load `/`, `/listen`, `/photography`, and **record + send a transmission
on `/transmit`**. Confirm the object landed in GCS:
```bash
gcloud storage ls "gs://${TRANSMISSIONS_BUCKET}/transmissions/"
```

**ROLLBACK:** `gcloud run services delete $SERVICE --region $REGION`. Vercel is still live
and untouched.

---

## Phase 5 — GitHub Actions CI/CD via Workload Identity Federation

**Create the WIF pool + provider, scoped to your repo** (no JSON keys ever leave GCP):

```bash
gcloud iam workload-identity-pools create "$WIF_POOL" \
  --location="global" --display-name="GitHub Actions pool"

OWNER="${GITHUB_REPO%%/*}"
gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
  --location="global" --workload-identity-pool="$WIF_POOL" \
  --display-name="GitHub provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner=='${OWNER}'"

# Let *only this repo* impersonate the deployer SA:
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}"

WIF_PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"
echo "$WIF_PROVIDER_RESOURCE"
```

**Add the workflow** `.github/workflows/deploy.yml` (Appendix A) on the `gcp-migration`
branch. It triggers on push to `main` **and** on manual `workflow_dispatch` (so you can
test CI from the branch before cutover).

**Set GitHub Actions variables** (non-secret; WIF needs no stored keys):

```bash
gh variable set GCP_PROJECT_ID         -R "$GITHUB_REPO" -b "$PROJECT_ID"
gh variable set GCP_REGION             -R "$GITHUB_REPO" -b "$REGION"
gh variable set GCP_SERVICE            -R "$GITHUB_REPO" -b "$SERVICE"
gh variable set GCP_RUNTIME_SA         -R "$GITHUB_REPO" -b "$RUNTIME_EMAIL"
gh variable set GCP_WIF_PROVIDER       -R "$GITHUB_REPO" -b "$WIF_PROVIDER_RESOURCE"
gh variable set GCP_DEPLOYER_SA        -R "$GITHUB_REPO" -b "$DEPLOYER_EMAIL"
gh variable set GCP_TRANSMISSIONS_BUCKET -R "$GITHUB_REPO" -b "$TRANSMISSIONS_BUCKET"
```

Commit + push the workflow, then **test CI on the branch**:

```bash
git add .github/workflows/deploy.yml && git commit -m "ci: deploy to Cloud Run via WIF"
git push
gh workflow run deploy.yml --ref gcp-migration -R "$GITHUB_REPO"
gh run watch -R "$GITHUB_REPO"
```

**VERIFY:** the `workflow_dispatch` run succeeds end-to-end (auth → build → deploy) and a
new Cloud Run revision is live:
```bash
gcloud run revisions list --service "$SERVICE" --region "$REGION" --format='table(name,active)'
```

**ROLLBACK:** delete the workflow file; remove the WIF binding
(`gcloud iam service-accounts remove-iam-policy-binding …`). No production impact.

---

## Phase 6 — Load Balancer, managed TLS, and pre-cutover validation

Front Cloud Run with a Global External Application Load Balancer (static anycast IP +
Google-managed cert; cleanly supports apex domains and leaves room for Cloud CDN/Cloud
Armor later).

```bash
# 1) Static IP
gcloud compute addresses create "$LB_IP_NAME" --global
LB_IP="$(gcloud compute addresses describe "$LB_IP_NAME" --global --format='value(address)')"
echo "Load Balancer IP: $LB_IP"

# 2) Serverless NEG → Cloud Run
gcloud compute network-endpoint-groups create vlg-neg \
  --region="$REGION" --network-endpoint-type=serverless --cloud-run-service="$SERVICE"

# 3) Backend service
gcloud compute backend-services create vlg-backend \
  --global --load-balancing-scheme=EXTERNAL_MANAGED
gcloud compute backend-services add-backend vlg-backend \
  --global --network-endpoint-group=vlg-neg --network-endpoint-group-region="$REGION"

# 4) URL map
gcloud compute url-maps create vlg-urlmap --default-service=vlg-backend

# 5) Google-managed cert — include the temp subdomain so the LB has a valid cert to
#    serve during testing; the apex/www domains validate at cutover.
gcloud compute ssl-certificates create vlg-cert --global \
  --domains="${DOMAINS},${TEST_SUBDOMAIN}"

# 6) HTTPS proxy + forwarding rule (443)
gcloud compute target-https-proxies create vlg-https-proxy \
  --url-map=vlg-urlmap --ssl-certificates=vlg-cert
gcloud compute forwarding-rules create vlg-https-fr \
  --global --target-https-proxy=vlg-https-proxy --address="$LB_IP_NAME" --ports=443

# 7) HTTP→HTTPS redirect (port 80). Create the redirect url-map from YAML:
cat > /tmp/vlg-http-redirect.yaml <<'YAML'
kind: compute#urlMap
name: vlg-http-redirect
defaultUrlRedirect:
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
  httpsRedirect: true
YAML
gcloud compute url-maps import vlg-http-redirect --global --source=/tmp/vlg-http-redirect.yaml --quiet
gcloud compute target-http-proxies create vlg-http-proxy --url-map=vlg-http-redirect
gcloud compute forwarding-rules create vlg-http-fr \
  --global --target-http-proxy=vlg-http-proxy --address="$LB_IP_NAME" --ports=80
```

**Validate the whole stack on the temp subdomain — without touching the live domains.**
In Namecheap, add **one** record for the test subdomain:

```
Type: A Record   Host: gcp   Value: <LB_IP>   TTL: 1 min
```

Wait for DNS + the managed cert to validate that subdomain (can take 10–60 min):

```bash
dig +short "$TEST_SUBDOMAIN"     # should return $LB_IP
gcloud compute ssl-certificates describe vlg-cert --global \
  --format='value(managed.status, managed.domainStatus)'
```

**VERIFY:** once `${TEST_SUBDOMAIN}` shows `ACTIVE` in `domainStatus`:
```bash
curl -I "https://${TEST_SUBDOMAIN}"          # 200 over HTTPS via the LB
curl -I "http://${TEST_SUBDOMAIN}"           # 301 → https
```
Browse `https://gcp.vlgfm.live` and re-run the full smoke test (home, `/listen`, mix
playback, `/transmit` upload). This proves the LB → Cloud Run → app → R2 → GCS path works
under real TLS. The apex/www entries in the cert remain `PROVISIONING` until Phase 8 —
that's expected.

**ROLLBACK:** delete the test `gcp` A record and, if abandoning, the forwarding rules /
proxies / backend / NEG / address. Live domains untouched.

---

## Phase 7 — Migrate existing `/transmit` uploads (Vercel Blob → GCS)

Copy any transmissions already stored in Vercel Blob into the GCS bucket so nothing is
lost when Vercel is decommissioned. Script: **Appendix B** (`scripts/migrate-blob-to-gcs.mjs`).

```bash
export BLOB_READ_WRITE_TOKEN="<from Vercel project env>"   # read access to the Blob store
export TRANSMISSIONS_BUCKET="$TRANSMISSIONS_BUCKET"
gcloud auth application-default login                       # ADC for the GCS write side
node scripts/migrate-blob-to-gcs.mjs
```

**VERIFY:** object counts match (compare the script's reported Blob count to GCS):
```bash
gcloud storage ls --recursive "gs://${TRANSMISSIONS_BUCKET}/transmissions/" | wc -l
```

**ROLLBACK:** GCS objects can be deleted; the Blob originals are untouched (read-only copy).

---

## Phase 8 — 🛑 HUMAN GATE: DNS cutover

> **Get the owner's explicit "go" before running this phase.** This is the moment traffic
> moves from Vercel to GCP. Rollback is fast (revert DNS) because TTLs are low and Vercel
> stays up.

**8a. Lower TTLs first (do this ~24–48h ahead).** In Namecheap, set the TTL on the apex
`@` and `www` records for **both** domains to the minimum (1 min). This shrinks the
rollback window. Verify the low TTL is live:
```bash
dig vlgfm.live A | grep -A1 'ANSWER SECTION'
```

**8b. Make `main` the GCP source of truth.** Merge the branch — this both points ongoing
CI at Cloud Run and is the cutover commit:
```bash
git checkout main && git pull
git merge --no-ff gcp-migration -m "feat: migrate hosting/CI/storage to GCP"
git push origin main          # triggers .github/workflows/deploy.yml → Cloud Run
gh run watch -R "$GITHUB_REPO"
```
Confirm the Action deployed a fresh revision and the `*.run.app` URL is healthy before
flipping DNS. (Vercel will also auto-deploy this commit; that's fine — its `/transmit`
will error without GCP creds, but traffic is about to leave Vercel and it's being torn
down in Phase 9.)

**8c. Flip the live DNS.** In Namecheap, for **both** `vlgfm.live` and `villageradio.xyz`,
replace the Vercel records with A records to the LB IP:

```
@     A Record   <LB_IP>   TTL 1 min      (remove the old Vercel A record)
www   A Record   <LB_IP>   TTL 1 min      (replace the old www CNAME)
```

**8d. Wait for the managed cert to validate the live domains** (now that they resolve to
the LB):
```bash
watch -n 30 "gcloud compute ssl-certificates describe vlg-cert --global \
  --format='value(managed.status, managed.domainStatus)'"
```
All four domains should move to `ACTIVE` (typically minutes once DNS has propagated).

**VERIFY:**
```bash
for d in vlgfm.live www.vlgfm.live villageradio.xyz www.villageradio.xyz; do
  echo "== $d =="; dig +short "$d" A; curl -sI "https://$d" | head -n1;
done
```
Expect every domain to resolve to `$LB_IP` and return `200`/`301`. Browse the production
domain and run the full smoke test (mix playback + a real `/transmit` upload landing in
GCS). Watch logs:
```bash
gcloud run services logs read "$SERVICE" --region "$REGION" --limit=50
```

**ROLLBACK (fast):** in Namecheap, restore the saved Vercel records (apex A →
`76.76.21.21`, `www` CNAME → `cname.vercel-dns.com`, or whatever Phase 0 recorded). With
1-min TTL, traffic returns to Vercel within minutes. Do **not** start Phase 9 until the
site has been stable on GCP for 48–72h.

---

## Phase 9 — 🛑 HUMAN GATE: decommission Vercel

> Only after **48–72h of stable GCP operation** and owner sign-off. This is the point of
> no return for the Vercel side.

1. **Confirm GCS has all transmissions** (Phase 7 verified) and that `/transmit` on the
   live domain writes to GCS.
2. **Remove the domains from the Vercel project** (Vercel dashboard → Project → Settings →
   Domains) so Vercel stops claiming them.
3. **Delete the Vercel Blob store** (after confirming the GCS copy).
4. **Delete / pause the Vercel project** (or disconnect the Git integration so pushes no
   longer build on Vercel).
5. **Clean up the repo** (on a branch → PR → merge to `main`, which now deploys via GitHub
   Actions → Cloud Run):
   ```bash
   npm uninstall @vercel/blob
   git rm -r --cached .vercel 2>/dev/null || true
   ```
   - Remove `BLOB_READ_WRITE_TOKEN` references from docs and any `.env` examples.
   - **Update `AGENTS.md` and `CLAUDE.md`** to describe the new infra: Cloud Run hosting,
     Cloud Build + GitHub Actions/WIF CI/CD, `/transmit` → GCS bucket, `TRANSMISSIONS_BUCKET`
     env var, and that `main` now auto-deploys to Cloud Run (not Vercel). This keeps the
     agent source-of-truth correct.
   - Delete the temporary `gcp` DNS record and remove `${TEST_SUBDOMAIN}` from the cert if
     you want a clean cert (`gcloud compute ssl-certificates` must be recreated to change
     domains — optional; harmless to leave).

**VERIFY:** push a trivial commit to `main`; confirm GitHub Actions deploys to Cloud Run
and **no** Vercel build runs. The live site stays up throughout.

**ROLLBACK:** none — this phase is intentionally terminal. (Vercel projects can be
recreated from the repo if ever needed, but treat this as final.)

---

## Rollback summary

| Phase | Reversible? | How to roll back |
|---|---|---|
| 1–2 Bootstrap, bucket | Yes | Delete SAs / AR repo / bucket / project. Nothing serving. |
| 3 Code changes | Yes | Branch-only; `git checkout main`. |
| 4 Manual deploy | Yes | `gcloud run services delete $SERVICE`. Vercel still live. |
| 5 CI/WIF | Yes | Delete workflow + WIF binding. |
| 6 Load Balancer | Yes | Delete LB resources + test DNS record. Live domains untouched. |
| 7 Data copy | Yes | Delete GCS objects; Blob originals intact. |
| **8 DNS cutover** | **Fast** | Restore saved Namecheap records (1-min TTL → minutes). Vercel still up. |
| **9 Decommission** | **No** | Terminal by design. |

---

## Known limitations & optional upgrades (not required for cutover)

- **Rate limiting stays in-memory/per-instance** (same best-effort behavior as on Vercel).
  Cloud Run scales horizontally, so the effective limit is `limit × warm instances`. The
  *correct* home for rate limiting on this architecture is **Cloud Armor** attached to the
  load balancer (per-IP throttling at the edge) — add a security policy to `vlg-backend`
  later if abuse becomes an issue. Memorystore for Redis is an alternative for exact limits.
- **Egress costs:** mixes stay on Cloudflare R2 specifically because R2 egress is free;
  GCS would bill egress on audio streaming. Do not "finish the migration" by moving mixes
  to GCS without accepting that cost.
- **Fixed LB cost:** a Global External LB has an hourly + per-forwarding-rule charge
  (~$18–25/mo). If you want to avoid it for a hobby budget, the simpler alternative is
  **Cloud Run domain mappings** (`gcloud beta run domain-mappings create`) — no LB, managed
  cert, but apex domains need the specific A/AAAA records Google returns and you lose the
  static IP / Cloud Armor / CDN options. The LB path above is recommended for production.
- **Region:** set `REGION` to the location nearest your listeners before Phase 1; moving a
  Cloud Run service between regions later means redeploying and re-pointing the NEG.

---

## Appendix A — File contents

### `next.config.ts`
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    formats: ['image/webp', 'image/avif'],
  },
};

export default nextConfig;
```

### `src/app/api/transmissions/route.ts`
```ts
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

export const runtime = 'nodejs';

const MAX_BYTES = 5_242_880; // 5 MB

// One client per warm instance. On Cloud Run this authenticates via the attached
// runtime service account (ADC); locally via `gcloud auth application-default login`.
const storage = new Storage();

function bucketName(): string {
  const name = process.env.TRANSMISSIONS_BUCKET;
  if (!name) throw new Error('TRANSMISSIONS_BUCKET is not set');
  return name;
}

function sanitizeHandle(raw: string | null): string {
  if (!raw) return 'anon';
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_\-.]/g, '').slice(0, 64);
  return cleaned.length === 0 ? 'anon' : cleaned;
}

function isoTimestampForKey(): string {
  // 2026-05-17T22-14-03Z — filesystem-safe
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
}

function randomSuffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

export async function POST(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    console.error('[transmissions] form parse failed', err);
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const audio = form.get('audio');
  const handleRaw = form.get('handle');

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'missing_audio' }, { status: 400 });
  }
  if (!audio.type.startsWith('audio/webm')) {
    return NextResponse.json({ ok: false, error: 'invalid_audio_type' }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ ok: false, error: 'empty_audio' }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'audio_too_large' }, { status: 400 });
  }

  const handle = sanitizeHandle(typeof handleRaw === 'string' ? handleRaw : null);
  const key = `transmissions/${isoTimestampForKey()}-${handle}-${randomSuffix()}.webm`;

  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    // Private object; uniform bucket-level access + public-access-prevention keep it so.
    await storage.bucket(bucketName()).file(key).save(buffer, {
      contentType: 'audio/webm',
      resumable: false,
    });
  } catch (err) {
    console.error('[transmissions] upload failed', err);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

### `Dockerfile`
```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# `public` carries the LFS-pulled interludes; standalone output carries the server.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
ENV PORT=8080 HOSTNAME=0.0.0.0
EXPOSE 8080
CMD ["node", "server.js"]
```

### `.dockerignore`
```
node_modules
.next
.git
.github
docs
references
.env*
Dockerfile
.dockerignore
.gcloudignore
*.tsbuildinfo
npm-debug.log*
# NOTE: do NOT exclude public/ — the interlude MP3s must ship in the image.
```

### `.gcloudignore`
```
.git
.github
node_modules
.next
.env*
references
docs
*.tsbuildinfo
# Without this file, gcloud falls back to .gitignore, which excludes public/audio and
# would ship pointer files. Do NOT add public/ or public/audio here.
```

### `.github/workflows/deploy.yml`
```yaml
name: deploy
on:
  push:
    branches: [main]
  workflow_dispatch: {}   # lets you test CI from the migration branch before cutover

permissions:
  contents: read
  id-token: write          # required for Workload Identity Federation

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true        # materialize the real interlude MP3s into the build context

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
          service_account: ${{ vars.GCP_DEPLOYER_SA }}

      - uses: google-github-actions/setup-gcloud@v2

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy "${{ vars.GCP_SERVICE }}" \
            --source . \
            --project "${{ vars.GCP_PROJECT_ID }}" \
            --region "${{ vars.GCP_REGION }}" \
            --service-account "${{ vars.GCP_RUNTIME_SA }}" \
            --set-env-vars "TRANSMISSIONS_BUCKET=${{ vars.GCP_TRANSMISSIONS_BUCKET }}" \
            --allow-unauthenticated \
            --min-instances 1 --max-instances 4 \
            --cpu 1 --memory 512Mi \
            --quiet
```

---

## Appendix B — `scripts/migrate-blob-to-gcs.mjs`

One-time copy of existing Vercel Blob transmissions into the GCS bucket. Plain Node (no
shell-specific deps), consistent with the repo's cross-OS convention.

```js
// Usage:
//   export BLOB_READ_WRITE_TOKEN=...        # Vercel Blob read token
//   export TRANSMISSIONS_BUCKET=...         # target GCS bucket
//   gcloud auth application-default login   # ADC for GCS
//   node scripts/migrate-blob-to-gcs.mjs
import { list } from '@vercel/blob';
import { Storage } from '@google-cloud/storage';

const bucketName = process.env.TRANSMISSIONS_BUCKET;
if (!bucketName) throw new Error('TRANSMISSIONS_BUCKET is not set');

const storage = new Storage();
const bucket = storage.bucket(bucketName);

let cursor;
let copied = 0;
do {
  const { blobs, cursor: next } = await list({ cursor, limit: 100 });
  for (const blob of blobs) {
    const res = await fetch(blob.url);
    if (!res.ok) throw new Error(`fetch failed for ${blob.pathname}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await bucket.file(blob.pathname).save(buf, {
      contentType: blob.contentType ?? 'audio/webm',
      resumable: false,
    });
    copied += 1;
    console.log(`copied ${blob.pathname}`);
  }
  cursor = next;
} while (cursor);

console.log(`done — copied ${copied} object(s) to gs://${bucketName}`);
```

---

## Quick reference — phase order

1. Bootstrap project (APIs, AR, service accounts, IAM)
   - **Team access** — add the teammate as a second admin (GCP / GitHub / DNS / Vercel / R2)
2. Private GCS transmissions bucket
3. Containerization code changes on `gcp-migration` (verify build + real audio)
4. Manual Cloud Run deploy → validate on `*.run.app`
5. GitHub Actions + WIF → validate via `workflow_dispatch`
6. Load Balancer + managed cert → validate on `gcp.vlgfm.live`
7. Copy Vercel Blob → GCS
8. 🛑 DNS cutover (lower TTL → merge to `main` → flip Namecheap → cert ACTIVE)
9. 🛑 Decommission Vercel (after 48–72h stable) + update `AGENTS.md`/`CLAUDE.md`
