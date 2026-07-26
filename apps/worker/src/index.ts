import { Redis } from "ioredis";
import { loadEnv } from "@mail-orbyt/config";
import { createLogger } from "@mail-orbyt/logging";
import { prisma } from "@mail-orbyt/database";
import { S3ObjectStorage } from "@mail-orbyt/storage";
import type { Worker } from "bullmq";
import { createLeadImportWorker } from "./queues/lead-import";

/**
 * Worker process bootstrap. Job queues (import, research, generation,
 * scheduling, send, reply-sync) are registered as they land in later phases
 * — see docs/queue-architecture.md. Phase 3 adds the first real queue
 * (lead-import); Phase 0 established the process lifecycle: connect
 * dependencies, drain in-flight work on shutdown signals, exit non-zero on
 * unrecoverable startup failure.
 */

const env = loadEnv();
const logger = createLogger({ service: "worker", level: env.LOG_LEVEL });

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const storage = new S3ObjectStorage({
  endpoint: env.STORAGE_ENDPOINT,
  region: env.STORAGE_REGION,
  bucket: env.STORAGE_BUCKET,
  accessKeyId: env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
});

const workers: Worker[] = [];

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("worker shutting down", { signal });

  await Promise.allSettled([
    ...workers.map((worker) => worker.close()),
    redis.quit(),
    prisma.$disconnect(),
  ]);

  logger.info("worker shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

async function main(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();

  workers.push(
    createLeadImportWorker({
      connection: redis,
      prisma,
      storage,
      logger: logger.child({ queue: "lead-import" }),
    }),
  );

  logger.info("worker started", { environment: env.NODE_ENV, queues: ["lead-import"] });
}

main().catch((error: unknown) => {
  logger.error("worker failed to start", { error });
  process.exit(1);
});
