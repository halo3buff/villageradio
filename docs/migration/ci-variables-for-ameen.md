# CI config → GitHub repo Actions variables (for the repo owner)

**Who runs this:** Ameen (`halo3buff`) — the **owner** of `halo3buff/villageradio`.
**Why only you:** this is a **personal** repo (not org-owned), so only the owner has
admin. Setting repository **Actions variables** requires admin, which Adnan
(`adnan-shoukfeh`, write access) does **not** have on this repo.

**What this does:** moves the seven non-secret deploy values out of the workflow file
(`.github/workflows/deploy.yml`, where they're currently hard-coded) into GitHub
**repository variables**. After you set them, Adnan switches the workflow to read
`${{ vars.* }}`. Nothing here is a secret — Cloud Run auth uses Workload Identity
Federation (keyless), so there are no tokens or keys involved.

> Optional / cleanliness only. CD already works today with the values inlined; this is
> just nicer governance. Skip it if you don't care.

---

## Prerequisites

You need the GitHub CLI, authenticated as **halo3buff**:

```bash
gh --version          # install: https://cli.github.com  (macOS: brew install gh)
gh auth status        # must show you logged in as halo3buff
# if not logged in as halo3buff:
gh auth login
```

---

## Run these (copy–paste the whole block)

```bash
R=halo3buff/villageradio

gh variable set GCP_PROJECT_ID           -R "$R" -b "village-radio"
gh variable set GCP_REGION               -R "$R" -b "us-central1"
gh variable set GCP_SERVICE              -R "$R" -b "vlgfm"
gh variable set GCP_RUNTIME_SA           -R "$R" -b "vlgfm-run@village-radio.iam.gserviceaccount.com"
gh variable set GCP_WIF_PROVIDER         -R "$R" -b "projects/319817275609/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
gh variable set GCP_DEPLOYER_SA          -R "$R" -b "vlgfm-deployer@village-radio.iam.gserviceaccount.com"
gh variable set GCP_TRANSMISSIONS_BUCKET -R "$R" -b "vlg-transmissions-village-radio"
```

---

## Verify (should list all 7)

```bash
gh variable list -R halo3buff/villageradio
```

Expected names: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_SERVICE`, `GCP_RUNTIME_SA`,
`GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`, `GCP_TRANSMISSIONS_BUCKET`.

---

## Then tell Adnan

Once `gh variable list` shows all seven, message Adnan. He will switch
`.github/workflows/deploy.yml` from the hard-coded values to `${{ vars.GCP_* }}`,
push, and confirm a green deploy run — no further action needed from you.

---

### Reference: what each value is

| Variable | Value | Meaning |
|---|---|---|
| `GCP_PROJECT_ID` | `village-radio` | GCP project |
| `GCP_REGION` | `us-central1` | Cloud Run / Artifact Registry region |
| `GCP_SERVICE` | `vlgfm` | Cloud Run service name |
| `GCP_RUNTIME_SA` | `vlgfm-run@…` | SA the Cloud Run container runs as |
| `GCP_WIF_PROVIDER` | `projects/319817275609/…/providers/github-provider` | Workload Identity provider GitHub auths against |
| `GCP_DEPLOYER_SA` | `vlgfm-deployer@…` | SA GitHub Actions impersonates to deploy |
| `GCP_TRANSMISSIONS_BUCKET` | `vlg-transmissions-village-radio` | Private GCS bucket for `/transmit` uploads |
