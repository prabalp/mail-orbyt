import type { PrismaClient } from "@mail-orbyt/database";
import type { Logger } from "@mail-orbyt/logging";
import {
  SCHEDULER_QUEUE_NAME,
  enqueueDueOutboxItems,
  enqueueOutboxItem,
} from "@mail-orbyt/scheduling";
import { Worker, type ConnectionOptions } from "bullmq";

const LOOKAHEAD_MS = 60_000;

export function createCampaignSchedulerWorker(params: {
  connection: ConnectionOptions;
  prisma: PrismaClient;
  logger: Logger;
}): Worker {
  const worker = new Worker(
    SCHEDULER_QUEUE_NAME,
    async () => {
      const { scheduled, considered } = await enqueueDueOutboxItems(params.prisma);
      params.logger.info("scheduler tick", { scheduled, considered });

      const due = await params.prisma.outboxItem.findMany({
        where: {
          status: "SCHEDULED",
          scheduledFor: { lte: new Date(Date.now() + LOOKAHEAD_MS) },
        },
        select: { id: true, scheduledFor: true },
      });

      for (const item of due) {
        const delayMs = Math.max(0, item.scheduledFor.getTime() - Date.now());
        await enqueueOutboxItem(params.connection, { outboxItemId: item.id }, delayMs);
      }
    },
    { connection: params.connection, concurrency: 1 },
  );

  worker.on("failed", (job, error) => {
    params.logger.error("scheduler tick failed", { jobId: job?.id, error });
  });

  return worker;
}
