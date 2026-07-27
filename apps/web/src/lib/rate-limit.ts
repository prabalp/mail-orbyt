import { createRedisRateLimiter, type RateLimiter } from "@mail-orbyt/authentication";
import { redisConnection } from "@/lib/queue";

export const rateLimiter: RateLimiter = createRedisRateLimiter(redisConnection);

/** IP-based key for unauthenticated endpoints (sign-up, forgot-password) — these have no account/email guaranteed valid yet, so the client IP is the only available identifier. Trusts x-forwarded-for as set by the deployment's reverse proxy; see docs/deployment.md for why this is safe only behind a trusted proxy. */
export function clientIpFrom(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? "unknown";
}
