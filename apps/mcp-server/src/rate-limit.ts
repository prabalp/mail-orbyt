import type { NextFunction, Response } from "express";
import { Redis } from "ioredis";
import { loadEnv } from "@mail-orbyt/config";
import { createRedisRateLimiter, type RateLimiter } from "@mail-orbyt/authentication";
import { createLogger } from "@mail-orbyt/logging";
import type { AuthenticatedRequest } from "./auth-middleware.js";

const logger = createLogger({ service: "mcp-server" });

/** Requests per token per window. An interactive agent session makes bursts of tool calls, so this is set well above human-paced use and is a runaway-loop backstop, not a usage quota. */
const MAX_REQUESTS = 120;
const WINDOW_SECONDS = 60;

let sharedRedis: Redis | undefined;

function redisConnection(): Redis {
  sharedRedis ??= new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
  return sharedRedis;
}

/**
 * Per-CONNECTION rate limiting, keyed on the OAuth client + user + org
 * rather than the client IP: every request from a given AI client arrives
 * from the same handful of egress IPs, so an IP key would either throttle
 * unrelated tenants together or be trivially wide. Keying on the token's
 * own identity means one runaway agent loop can only exhaust its own
 * budget.
 *
 * Fails OPEN if Redis is unavailable — a rate limiter that can't reach its
 * backing store must not take the whole MCP surface down with it.
 */
export function mcpRateLimitMiddleware(
  limiter: RateLimiter = createRedisRateLimiter(redisConnection()),
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const actor = req.actor;
    if (!actor) {
      next();
      return;
    }

    const key = `mcp:rl:${actor.clientId}:${actor.userId}:${actor.organisationId}`;

    let allowed: boolean;
    try {
      allowed = await limiter.attempt(key, MAX_REQUESTS, WINDOW_SECONDS);
    } catch (error) {
      logger.error("MCP rate limiter unavailable, allowing request", {
        error: error instanceof Error ? error.message : String(error),
        organisationId: actor.organisationId,
      });
      next();
      return;
    }

    if (!allowed) {
      logger.warn("MCP rate limit exceeded", {
        organisationId: actor.organisationId,
        userId: actor.userId,
        clientId: actor.clientId,
      });
      res.setHeader("Retry-After", String(WINDOW_SECONDS));
      res.status(429).json({
        error: "rate_limited",
        message: `Too many requests — this connection is limited to ${MAX_REQUESTS} calls per ${WINDOW_SECONDS} seconds. Wait and retry.`,
      });
      return;
    }

    next();
  };
}
