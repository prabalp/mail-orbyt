import type { PrismaClient } from "@mail-orbyt/database";
import type { Logger } from "@mail-orbyt/logging";
import { resolveOrgAiConfig } from "@mail-orbyt/ai-settings";
import { loadEnv } from "@mail-orbyt/config";
import { getAiEmailGenerator, isAiConfigured } from "@mail-orbyt/email-generation";
import { sendFromInbox } from "@mail-orbyt/gmail";
import { OUTBOX_QUEUE_NAME, processOutboxItem, type OutboxJobData } from "@mail-orbyt/scheduling";
import { Worker, type ConnectionOptions, type Job } from "bullmq";

async function getSenderContext(prisma: PrismaClient, organisationId: string) {
  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisationId },
  });
  // Sender NAME comes from the inbox actually sending (see
  // resolveInboxSenderName in packages/scheduling/src/outbox-service.ts),
  // not from here — the organisation only supplies company-level context.
  return {
    senderCompanyName: organisation.name,
    campaignPrompt: organisation.emailPromptInstructions ?? undefined,
    bookingLink: organisation.calendlyUrl ?? undefined,
    generationSystemPromptOverride: organisation.generationSystemPrompt ?? undefined,
    reviewSystemPromptOverride: organisation.reviewSystemPrompt ?? undefined,
  };
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
          resolveAiGenerator: async (organisationId) => {
            // Per organisation, not per worker: each may bring its own
            // provider key/model, and this worker serves all of them.
            const aiConfig = await resolveOrgAiConfig(params.prisma, organisationId);
            return isAiConfigured(aiConfig) ? getAiEmailGenerator(aiConfig) : undefined;
          },
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
