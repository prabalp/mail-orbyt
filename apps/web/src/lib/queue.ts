import { loadEnv } from "@mail-orbyt/config";
import { Redis } from "ioredis";

const env = loadEnv();

declare global {
  var __bullConnection: Redis | undefined;
}

/**
 * Shared ioredis connection for BullMQ queue producers in this app.
 * Reused across hot-reloads in development the same way the Prisma client
 * singleton is (see @mail-orbyt/database), to avoid exhausting Redis
 * connections.
 */
export const redisConnection: Redis =
  globalThis.__bullConnection ?? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

if (env.NODE_ENV !== "production") {
  globalThis.__bullConnection = redisConnection;
}
