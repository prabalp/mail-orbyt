import { describe, expect, it, vi } from "vitest";
import { peekRateLimit, reserveRateLimit } from "./rate-limiter";

function fakeRedis() {
  const store = new Map<string, number>();
  return {
    get: vi.fn(async (key: string) => {
      const value = store.get(key);
      return value === undefined ? null : String(value);
    }),
    incr: vi.fn(async (key: string) => {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
  };
}

describe("rate-limiter", () => {
  it("peekRateLimit never mutates state", async () => {
    const redis = fakeRedis();
    const first = await peekRateLimit(redis as never, "org-1", "TWITTER", 5, 20);
    const second = await peekRateLimit(redis as never, "org-1", "TWITTER", 5, 20);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("reserveRateLimit consumes a slot and eventually blocks", async () => {
    const redis = fakeRedis();
    for (let i = 0; i < 5; i++) {
      const result = await reserveRateLimit(redis as never, "org-1", "TWITTER", 5, 20);
      expect(result.allowed).toBe(true);
    }
    const sixth = await reserveRateLimit(redis as never, "org-1", "TWITTER", 5, 20);
    expect(sixth.allowed).toBe(false);
    expect(sixth.withinHourlyLimit).toBe(false);
  });

  it("peekRateLimit reflects slots already consumed by reserveRateLimit", async () => {
    const redis = fakeRedis();
    await reserveRateLimit(redis as never, "org-1", "TWITTER", 5, 20);
    await reserveRateLimit(redis as never, "org-1", "TWITTER", 5, 20);
    const peeked = await peekRateLimit(redis as never, "org-1", "TWITTER", 5, 20);
    expect(peeked.allowed).toBe(true);
    expect(peeked.withinHourlyLimit).toBe(true);
  });

  it("the daily limit blocks independently of the hourly limit", async () => {
    const redis = fakeRedis();
    for (let i = 0; i < 3; i++) {
      await reserveRateLimit(redis as never, "org-1", "TWITTER", 100, 3);
    }
    const next = await reserveRateLimit(redis as never, "org-1", "TWITTER", 100, 3);
    expect(next.withinHourlyLimit).toBe(true);
    expect(next.withinDailyLimit).toBe(false);
    expect(next.allowed).toBe(false);
  });
});
