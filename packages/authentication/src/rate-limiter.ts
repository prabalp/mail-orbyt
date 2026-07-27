import type { Redis } from "ioredis";

export interface RateLimiter {
  /** Records one attempt for `key` and returns whether it's still within the limit. Always call this even for the attempt that turns out to be over the limit, so the window advances consistently. */
  attempt(key: string, maxAttempts: number, windowSeconds: number): Promise<boolean>;
  /** Clears a key's counter — called after a successful action (e.g. a correct password) so a legitimate user isn't penalized for earlier failed attempts. */
  reset(key: string): Promise<void>;
}

/**
 * Fixed-window rate limiter backed by Redis (INCR + EXPIRE), so the limit
 * is enforced correctly across multiple app/worker instances — an
 * in-memory counter would reset per-process and per-restart, which is not
 * safe for brute-force protection in a real deployment.
 */
export function createRedisRateLimiter(redis: Redis): RateLimiter {
  return {
    async attempt(key: string, maxAttempts: number, windowSeconds: number): Promise<boolean> {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      return count <= maxAttempts;
    },
    async reset(key: string): Promise<void> {
      await redis.del(key);
    },
  };
}

/** Permissive fallback (always allows) — used where no Redis connection is available, e.g. unit tests that don't exercise rate limiting. Never use this in a real deployment. */
export function createNoopRateLimiter(): RateLimiter {
  return {
    async attempt(): Promise<boolean> {
      return true;
    },
    async reset(): Promise<void> {
      /* no-op */
    },
  };
}
