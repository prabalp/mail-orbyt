import { describe, expect, it, vi } from "vitest";
import { createNoopRateLimiter, createRedisRateLimiter } from "./rate-limiter";

function fakeRedis() {
  const store = new Map<string, number>();
  return {
    incr: vi.fn(async (key: string) => {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  };
}

describe("createRedisRateLimiter", () => {
  it("allows attempts up to the max, then blocks", async () => {
    const redis = fakeRedis();
    const limiter = createRedisRateLimiter(redis as never);

    expect(await limiter.attempt("key", 3, 60)).toBe(true);
    expect(await limiter.attempt("key", 3, 60)).toBe(true);
    expect(await limiter.attempt("key", 3, 60)).toBe(true);
    expect(await limiter.attempt("key", 3, 60)).toBe(false);
  });

  it("sets an expiry only on the first attempt in a window", async () => {
    const redis = fakeRedis();
    const limiter = createRedisRateLimiter(redis as never);

    await limiter.attempt("key", 5, 60);
    await limiter.attempt("key", 5, 60);

    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it("reset clears the counter, allowing further attempts", async () => {
    const redis = fakeRedis();
    const limiter = createRedisRateLimiter(redis as never);

    await limiter.attempt("key", 1, 60);
    expect(await limiter.attempt("key", 1, 60)).toBe(false);

    await limiter.reset("key");
    expect(await limiter.attempt("key", 1, 60)).toBe(true);
  });

  it("tracks different keys independently", async () => {
    const redis = fakeRedis();
    const limiter = createRedisRateLimiter(redis as never);

    await limiter.attempt("key-a", 1, 60);
    expect(await limiter.attempt("key-a", 1, 60)).toBe(false);
    expect(await limiter.attempt("key-b", 1, 60)).toBe(true);
  });
});

describe("createNoopRateLimiter", () => {
  it("always allows", async () => {
    const limiter = createNoopRateLimiter();
    for (let i = 0; i < 100; i += 1) {
      expect(await limiter.attempt("key", 1, 60)).toBe(true);
    }
  });
});
