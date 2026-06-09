# Admin panel deploy — the GitHub work (for Ameen)

**Who:** Ameen (`halo3buff`) — the **owner** of `halo3buff/villageradio`.
**Why only you:** it's a **personal** repo, so only the owner can set repository **Actions
variables** and merge to `main`. Adnan has write access but not admin.

You have **two jobs**: (1) make sure the 8 deploy **variables** are set, and (2) **merge `adnan` →
`main`** once Adnan says the GCP side is ready (that merge is what deploys to production).

> Nothing here is a secret. Cloud Run auth is keyless (Workload Identity Federation), and the
> sensitive values (admin password hash, session secret, R2 keys) live in **GCP Secret Manager** —
> Adnan handles those, not you. See the full picture in
> [`docs/admin-deployment-runbook.md`](./admin-deployment-runbook.md).

---

## Job 1 — set the GitHub Actions variables

The deploy workflow (`.github/workflows/deploy.yml`) reads these 8 `${{ vars.* }}` values. Seven were
set during the GCP migration; **`GCP_CONFIG_BUCKET` is new** for the admin panel (the content store).
`gh variable set` is an upsert, so it's safe to run the whole block — it just (re)sets all 8.

**Prerequisite —** GitHub CLI authenticated as `halo3buff`:

```bash
gh --version          # install: https://cli.github.com  (macOS: brew install gh)
gh auth status        # must show you logged in as halo3buff
# if not: gh auth login
```

**Run this whole block:**

```bash
R=halo3buff/villageradio

gh variable set GCP_PROJECT_ID           -R "$R" -b "village-radio"
gh variable set GCP_REGION               -R "$R" -b "us-central1"
gh variable set GCP_SERVICE              -R "$R" -b "vlgfm"
gh variable set GCP_RUNTIME_SA           -R "$R" -b "vlgfm-run@village-radio.iam.gserviceaccount.com"
gh variable set GCP_DEPLOYER_SA          -R "$R" -b "vlgfm-deployer@village-radio.iam.gserviceaccount.com"
gh variable set GCP_WIF_PROVIDER         -R "$R" -b "projects/319817275609/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
gh variable set GCP_TRANSMISSIONS_BUCKET -R "$R" -b "vlg-transmissions-village-radio"
gh variable set GCP_CONFIG_BUCKET        -R "$R" -b "vlg-config-village-radio"   # ← new for the admin panel
```

**Verify (should list all 8):**

```bash
gh variable list -R halo3buff/villageradio
```

Expected names: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_SERVICE`, `GCP_RUNTIME_SA`, `GCP_DEPLOYER_SA`,
`GCP_WIF_PROVIDER`, `GCP_TRANSMISSIONS_BUCKET`, `GCP_CONFIG_BUCKET`.

---

## Job 2 — merge `adnan` → `main` to deploy

**Wait for Adnan's go-ahead first.** Pushing to `main` triggers the deploy, and the deploy **fails**
if the GCP **secrets** it references don't exist yet. So only merge once Adnan confirms he's created
the secrets + buckets (runbook §B–§D). Coordination, not optional ordering.

When Adnan gives the OK:

```bash
# from a clean checkout, fast-forward main to adnan (or open a PR adnan→main and merge it)
git fetch origin
git checkout main
git merge --ff-only origin/adnan
git push origin main
```

That push starts the `deploy` workflow → `gcloud run deploy`. Watch it:

```bash
gh run watch -R halo3buff/villageradio
```

A green run means production is live on the new build. Then Adnan runs the smoke test (runbook §E,
step 15). If the run **fails on a missing secret**, it means a Secret Manager secret isn't created
yet — ping Adnan; no repo change needed, just re-run after he adds it.

---

### Reference — what each variable is

| Variable | Value | Meaning |
|---|---|---|
| `GCP_PROJECT_ID` | `village-radio` | GCP project |
| `GCP_REGION` | `us-central1` | Cloud Run region |
| `GCP_SERVICE` | `vlgfm` | Cloud Run service name |
| `GCP_RUNTIME_SA` | `vlgfm-run@…` | SA the running container uses (reads buckets/secrets) |
| `GCP_DEPLOYER_SA` | `vlgfm-deployer@…` | SA GitHub Actions impersonates to deploy |
| `GCP_WIF_PROVIDER` | `projects/319817275609/…/github-provider` | keyless Workload Identity provider |
| `GCP_TRANSMISSIONS_BUCKET` | `vlg-transmissions-village-radio` | private GCS bucket for `/transmit` uploads |
| `GCP_CONFIG_BUCKET` | `vlg-config-village-radio` | **new** — GCS bucket for the admin content manifests |
