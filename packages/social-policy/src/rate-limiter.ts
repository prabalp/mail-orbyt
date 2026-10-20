import { createRedisRateLimiter } from "@mail-orbyt/authentication";
import type { Redis } from "ioredis";
import type { SocialPlatformName } from "./types";

export interface RateLimitStatus {
  withinHourlyLimit: boolean;
  withinDailyLimit: boolean;
  allowed: boolean;
}

function hourKey(organisationId: string, platform: SocialPlatformName): string {
  return `social:ratelimit:hour:${organisationId}:${platform}`;
}

function dayKey(organisationId: string, platform: SocialPlatformName): string {
  return `social:ratelimit:day:${organisationId}:${platform}`;
}

/**
 * Read-only look-ahead: how many actions have already been recorded in the
 * current hour/day window, without consuming a slot. Used by the policy
 * engine at DECISION time (see policy-service.ts) to decide whether to
 * escalate a would-be-ALLOW action instead of letting it proceed — it must
 * not increment, or every action would consume two slots (one at decision
 * time, one again at publish time).
 */
export async function peekRateLimit(
  redis: Redis,
  organisationId: string,
  platform: SocialPlatformName,
  maxActionsPerHour: number,
  maxActionsPerDay: number,
): Promise<RateLimitStatus> {
  const [hourCount, dayCount] = await Promise.all([
    redis.get(hourKey(organisationId, platform)),
    redis.get(dayKey(organisationId, platform)),
  ]);

  const withinHourlyLimit = Number(hourCount ?? 0) < maxActionsPerHour;
  const withinDailyLimit = Number(dayCount ?? 0) < maxActionsPerDay;
  return { withinHourlyLimit, withinDailyLimit, allowed: withinHourlyLimit && withinDailyLimit };
}

/**
 * Reserves one slot against both the hourly and daily counters — this is
 * the operation that actually consumes rate-limit budget, using the same
 * Redis INCR+EXPIRE fixed-window limiter @mail-orbyt/authentication already
 * uses for brute-force protection. Call this exactly once per action,
 * synchronously in the publish worker immediately before the real network
 * call, never at decision time (use peekRateLimit there instead).
 */
export async function reserveRateLimit(
  redis: Redis,
  organisationId: string,
  platform: SocialPlatformName,
  maxActionsPerHour: number,
  maxActionsPerDay: number,
): Promise<RateLimitStatus> {
  const limiter = createRedisRateLimiter(redis);
  const [withinHourlyLimit, withinDailyLimit] = await Promise.all([
    limiter.attempt(hourKey(organisationId, platform), maxActionsPerHour, 60 * 60),
    limiter.attempt(dayKey(organisationId, platform), maxActionsPerDay, 24 * 60 * 60),
  ]);
  return { withinHourlyLimit, withinDailyLimit, allowed: withinHourlyLimit && withinDailyLimit };
}
