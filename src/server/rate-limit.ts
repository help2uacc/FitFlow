/** Small in-memory fixed-window rate limiter (single web process deployment). */
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  return b.count > limit ? { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) } : { ok: true, retryAfter: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}

/** Failure-only limiter: `blocked` checks without counting, `fail` records a failed attempt. */
export const failureLimiter = {
  blocked(key: string, limit: number) {
    const b = buckets.get(key);
    if (!b || b.reset < Date.now()) return false;
    return b.count >= limit;
  },
  fail(key: string, windowMs: number) {
    rateLimit(key, Number.MAX_SAFE_INTEGER, windowMs);
  },
  clear(key: string) {
    buckets.delete(key);
  },
};
