// Fixed-window rate limiter, in-memory.
//
// Trade-offs: state is per serverless instance, so the effective limit is
// (configured limit) × (concurrent warm instances). Fine for casual abuse and
// scraping; not a substitute for platform-level DDoS protection. Swap the
// store for Redis/Upstash if/when we leave Vercel or need exactness.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Bound memory growth in long-lived instances. Cleanup runs at most once per
// minute and only when the map has grown past a threshold.
const CLEANUP_THRESHOLD = 1000;
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = 0;

function maybeCleanup(now: number): void {
  if (buckets.size < CLEANUP_THRESHOLD) return;
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  maybeCleanup(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
  };
}
