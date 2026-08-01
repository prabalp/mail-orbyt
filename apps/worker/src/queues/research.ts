import type { PrismaClient } from "@mail-orbyt/database";
import type { Logger } from "@mail-orbyt/logging";
import {
  NotConfiguredEnrichmentProvider,
  NotConfiguredNewsProvider,
  NotConfiguredSearchProvider,
  RESEARCH_QUEUE_NAME,
  processResearchJob,
  type ResearchJobData,
} from "@mail-orbyt/research";
import { enqueueResearchKeywordsJob } from "@mail-orbyt/research-keywords";
import { Worker, type ConnectionOptions, type Job } from "bullmq";

/**
 * No search/news/enrichment provider is configured yet (no API keys) — the
 * Not-configured implementations make that an explicit, recorded state
 * (ResearchProviderRunStatus.SKIPPED_NOT_CONFIGURED) rather than a silent
 * no-op. Swap these for real implementations once a provider is wired up;
 * every other line of this worker stays the same.
 */
const providers = {
  search: new NotConfiguredSearchProvider(),
  news: new NotConfiguredNewsProvider(),
  enrichment: new NotConfiguredEnrichmentProvider(),
};

export function createResearchWorker(params: {
  connection: ConnectionOptions;
  prisma: PrismaClient;
  logger: Logger;
}): Worker<ResearchJobData> {
  const worker = new Worker<ResearchJobData>(
    RESEARCH_QUEUE_NAME,
    async (job: Job<ResearchJobData>) => {
      params.logger.info("processing research job", {
        jobId: job.id,
        researchJobId: job.data.researchJobId,
      });
      try {
        const { websiteSourceId } = await processResearchJob(
          params.prisma,
          providers,
          job.data.researchJobId,
        );
        // Auto-chain keyword extraction after a successful website fetch —
        // it reads the ResearchPageText that just got saved, never refetching.
        if (websiteSourceId) {
          const researchJob = await params.prisma.researchJob.findUniqueOrThrow({
            where: { id: job.data.researchJobId },
          });
          await enqueueResearchKeywordsJob(params.connection, {
            researchSourceId: websiteSourceId,
            organisationId: researchJob.organisationId,
          });
        }
      } catch (error) {
        await params.prisma.researchJob.update({
          where: { id: job.data.researchJobId },
          data: {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    },
    { connection: params.connection, concurrency: 4 },
  );

  worker.on("completed", (job) => {
    params.logger.info("research job completed", {
      jobId: job.id,
      researchJobId: job.data.researchJobId,
    });
  });

  worker.on("failed", (job, error) => {
    params.logger.error("research job failed", {
      jobId: job?.id,
      researchJobId: job?.data.researchJobId,
      error,
    });
  });

  return worker;
}
