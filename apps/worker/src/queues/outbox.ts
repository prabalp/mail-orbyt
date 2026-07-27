import type { PrismaClient } from "@mail-orbyt/database";
import type { Logger } from "@mail-orbyt/logging";
import { loadEnv } from "@mail-orbyt/config";
import { getAiEmailGenerator, isAiConfigured } from "@mail-orbyt/email-generation";
import { sendFromInbox } from "@mail-orbyt/gmail";
import { OUTBOX_QUEUE_NAME, processOutboxItem, type OutboxJobData } from "@mail-orbyt/scheduling";
import { Worker, type ConnectionOptions, type Job } from "bullmq";

async function getSenderContext(prisma: PrismaClient, organisationId: string) {
  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisationId },
  });
  // Simplification: the organisation's name is used as both the sender's
  // display name and company name in AI-generated copy — there is no
  // separate "from" persona configured per campaign yet.
  return { senderName: organisation.name, senderCompanyName: organisation.name };
}

export function createOutboxWorker(params: {
  connection: ConnectionOptions;
  prisma: PrismaClient;
  logger: Logger;
}): Worker<OutboxJobData> {
  const env = loadEnv();

  const worker = new Worker<OutboxJobData>(
    OUTBOX_QUEUE_NAME,
    async (job: Job<OutboxJobData>) => {
      params.logger.info("processing outbox item", {
        jobId: job.id,
        outboxItemId: job.data.outboxItemId,
      });

      await processOutboxItem(
        params.prisma,
        {
          aiGenerator: isAiConfigured() ? getAiEmailGenerator() : undefined,
          sendEmail: (inboxId, message) => sendFromInbox(params.prisma, inboxId, message),
          getSenderContext: (organisationId) => getSenderContext(params.prisma, organisationId),
          emergencyStop: env.EMERGENCY_STOP,
        },
        job.data.outboxItemId,
      );
    },
    { connection: params.connection, concurrency: 4 },
  );

  worker.on("completed", (job) => {
    params.logger.info("outbox item processed", {
      jobId: job.id,
      outboxItemId: job.data.outboxItemId,
    });
  });

  worker.on("failed", (job, error) => {
    params.logger.error("outbox item processing failed", {
      jobId: job?.id,
      outboxItemId: job?.data.outboxItemId,
      error,
    });
  });

  return worker;
}
