# 🛑 Cutover DNS — `vlgfm.live` (Namecheap)

**This is the production cutover.** Making these changes moves live traffic from Vercel to
GCP (Cloud Run). **Do NOT make them until the cutover "go"** (see sequence below). Rollback
is fast because TTLs are low and Vercel stays up.

Scope is **only `vlgfm.live`** — `villageradio.xyz` is not a registered domain, so there's
nothing to change there.

This doc is for a person or an agent. Humans: read the prose. Agents: the `RECORDS` and
`VERIFY` blocks are runnable/parseable.

---

## Cutover sequence (do in order)

1. **~24–48h ahead — lower TTL (safe, do early):** set the `@` A record and `www` CNAME
   TTLs to **1 min** in Namecheap. Shrinks the rollback window. (The `gcp` test CNAME is
   already 1 min.)
2. **Merge to `main`:** Adnan merges `gcp-migration` → `main` and confirms GitHub Actions
   deploys a healthy Cloud Run revision (this is the production deploy). Vercel will also
   auto-build this commit; that's fine — it's about to stop receiving traffic.
3. **Flip the records below at Namecheap** (this step).
4. **Cert auto-provisions** for `vlgfm.live` + `www.vlgfm.live` once DNS points at Google
   (~15–60 min). Then smoke-test the live domain.

---

## STEP — replace the live records (`vlgfm.live` → Advanced DNS)

### Remove (current Vercel records)
- **A** `@` → `216.198.79.1`   *(delete)*
- **CNAME** `www` → `bd218b13b64b60f3.vercel-dns-017.com`   *(delete)*

### Add (Google / Cloud Run)
```yaml
# RECORDS (add to vlgfm.live)
- { type: A,     host: '@',   value: 216.239.32.21 }
- { type: A,     host: '@',   value: 216.239.34.21 }
- { type: A,     host: '@',   value: 216.239.36.21 }
- { type: A,     host: '@',   value: 216.239.38.21 }
- { type: CNAME, host: 'www', value: ghs.googlehosted.com }   # NO trailing dot
# Optional but recommended (IPv6):
- { type: AAAA,  host: '@',   value: '2001:4860:4802:32::15' }
- { type: AAAA,  host: '@',   value: '2001:4860:4802:34::15' }
- { type: AAAA,  host: '@',   value: '2001:4860:4802:36::15' }
- { type: AAAA,  host: '@',   value: '2001:4860:4802:38::15' }
```

| Type  | Host  | Value                  | TTL   |
|-------|-------|------------------------|-------|
| A     | `@`   | `216.239.32.21`        | 1 min |
| A     | `@`   | `216.239.34.21`        | 1 min |
| A     | `@`   | `216.239.36.21`        | 1 min |
| A     | `@`   | `216.239.38.21`        | 1 min |
| CNAME | `www` | `ghs.googlehosted.com` | 1 min |
| AAAA  | `@`   | `2001:4860:4802:32::15`| 1 min |
| AAAA  | `@`   | `2001:4860:4802:34::15`| 1 min |
| AAAA  | `@`   | `2001:4860:4802:36::15`| 1 min |
| AAAA  | `@`   | `2001:4860:4802:38::15`| 1 min |

### Keep (do not touch)
- **TXT** `@` → `google-site-verification=hMT9Xv-PblU0nu4p16M6MR41Ps8TWRtnG-qQiEOfk3Q`
  (domain ownership — leave it).
- **CNAME** `gcp` → `ghs.googlehosted.com` (the test address — harmless to leave).
- Any MX / mail records.

> Namecheap reminder: enter CNAME values **without** a trailing dot, or the row won't save.

---

## VERIFY (after the flip)

```bash
# DNS now points at Google:
dig +short vlgfm.live A           # -> the four 216.239.x.21 addresses
dig +short www.vlgfm.live CNAME   # -> ghs.googlehosted.com.

# HTTPS serves once the cert provisions:
curl -sI https://vlgfm.live      | head -n1   # HTTP/2 200
curl -sI https://www.vlgfm.live  | head -n1   # HTTP/2 200 (or 301 -> apex)
```

---

## ROLLBACK (fast — within minutes at 1-min TTL)

Restore the two Vercel records:
- **A** `@` → `216.198.79.1`
- **CNAME** `www` → `bd218b13b64b60f3.vercel-dns-017.com`

Remove the Google A/AAAA + `www` CNAME you added. Traffic returns to Vercel (still up).
