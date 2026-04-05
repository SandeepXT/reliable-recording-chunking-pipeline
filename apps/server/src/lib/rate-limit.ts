import type { Context, Next } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-process token-bucket rate limiter.
 * Works well for single-instance deployments (Railway, Fly.io single machine).
 * For multi-instance horizontal scaling, swap this store for a Redis-backed
 * implementation (e.g. ioredis + sliding window).
 */
export function rateLimiter(options: {
  windowMs: number; // window size in milliseconds
  max: number;      // max requests per window per key
  keyFn?: (c: Context) => string; // key extractor (defaults to IP)
}) {
  const { windowMs, max, keyFn } = options;
  const store = new Map<string, RateLimitEntry>();

  // Periodically sweep expired entries so the map doesn't grow unbounded
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, windowMs * 2);
  // Don't keep the process alive just for sweeping
  if (sweepInterval.unref) sweepInterval.unref();

  return async function rateLimitMiddleware(c: Context, next: Next): Promise<Response | void> {
    const key = keyFn
      ? keyFn(c)
      : (c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown");

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      c.res.headers.set("X-RateLimit-Limit", String(max));
      c.res.headers.set("X-RateLimit-Remaining", String(max - 1));
      return next();
    }

    entry.count++;
    const remaining = Math.max(0, max - entry.count);
    c.res.headers.set("X-RateLimit-Limit", String(max));
    c.res.headers.set("X-RateLimit-Remaining", String(remaining));
    c.res.headers.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));

    if (entry.count > max) {
      return c.json(
        { error: "Too many requests. Please wait before retrying." },
        429,
      );
    }

    return next();
  };
}
