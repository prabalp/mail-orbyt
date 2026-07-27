import type { PrismaClient } from "@mail-orbyt/database";
import type { Logger } from "@mail-orbyt/logging";
import {
  SCHEDULER_QUEUE_NAME,
  enqueueDueOutboxItems,
  enqueueOutboxItem,
} from "@mail-orbyt/scheduling";
import { syncRepliesForOutboxItem } from "@mail-orbyt/conversations";
import { fetchThreadMessages } from "@mail-orbyt/gmail";
import { Worker, type ConnectionOptions } from "bullmq";

const LOOKAHEAD_MS = 60_000;
const REPLY_SYNC_WINDOW_DAYS = 14;

/**
 * Piggybacks reply-checking onto the same 60s tick that schedules sends,
 * rather than a separate queue — every ACTIVE enrollment's most recent SENT
 * item is checked for new replies in its Gmail thread. A reply exits the
 * enrollment (see syncRepliesForOutboxItem), so this is what makes
 * automation actually stop when a lead responds.
 */
async function syncRecentReplies(prisma: PrismaClient, logger: Logger): Promise<number> {
  const since = new Date(Date.now() - REPLY_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recentSentItems = await prisma.outboxItem.findMany({
    where: {
      status: "SENT",
      sentAt: { gte: since },
      providerThreadId: { not: null },
      enrollment: { status: "ACTIVE" },
    },
    select: { id: true },
  });

  let repliesFound = 0;
  for (const item of recentSentItems) {
    const result = await syncRepliesForOutboxItem(prisma, fetchThreadMessages, item.id);
    if (result.newReplies > 0) {
      repliesFound += result.newReplies;
      logger.info("reply detected, enrollment exited", { outboxItemId: item.id });
    }
  }
  return repliesFound;
}

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

      const repliesFound = await syncRecentReplies(params.prisma, params.logger);
      if (repliesFound > 0) {
        params.logger.info("reply sync found new replies", { repliesFound });
      }
    },
    { connection: params.connection, concurrency: 1 },
  );

  worker.on("failed", (job, error) => {
    params.logger.error("scheduler tick failed", { jobId: job?.id, error });
  });

  return worker;
}
