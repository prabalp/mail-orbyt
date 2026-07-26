import { Redis } from "ioredis";
import { loadEnv } from "@mail-orbyt/config";
import { createLogger } from "@mail-orbyt/logging";
import { prisma } from "@mail-orbyt/database";

/**
 * Worker process bootstrap. Job queues (import, research, generation,
 * scheduling, send, reply-sync) are registered as they land in later phases
 * — see docs/queue-architecture.md. Phase 0 establishes the process
 * lifecycle: connect dependencies, drain in-flight work on shutdown signals,
 * exit non-zero on unrecoverable startup failure.
 */

const env = loadEnv();
const logger = createLogger({ service: "worker", level: env.LOG_LEVEL });

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("worker shutting down", { signal });

  await Promise.allSettled([redis.quit(), prisma.$disconnect()]);

  logger.info("worker shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

async function main(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  logger.info("worker started", { environment: env.NODE_ENV });
}

main().catch((error: unknown) => {
  logger.error("worker failed to start", { error });
  process.exit(1);
});
