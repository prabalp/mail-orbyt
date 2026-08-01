import type { PrismaClient } from "@mail-orbyt/database";
import type { Logger } from "@mail-orbyt/logging";
import {
  RESEARCH_KEYWORDS_QUEUE_NAME,
  processKeywordExtractionJob,
  type ResearchKeywordsJobData,
} from "@mail-orbyt/research-keywords";
import { Worker, type ConnectionOptions, type Job } from "bullmq";

export function createResearchKeywordsWorker(params: {
  connection: ConnectionOptions;
  prisma: PrismaClient;
  logger: Logger;
}): Worker<ResearchKeywordsJobData> {
  const worker = new Worker<ResearchKeywordsJobData>(
    RESEARCH_KEYWORDS_QUEUE_NAME,
    async (job: Job<ResearchKeywordsJobData>) => {
      params.logger.info("processing keyword extraction job", {
        jobId: job.id,
        researchSourceId: job.data.researchSourceId,
      });
      await processKeywordExtractionJob(params.prisma, job.data.researchSourceId);
    },
    { connection: params.connection, concurrency: 4 },
  );

  worker.on("completed", (job) => {
    params.logger.info("keyword extraction job completed", {
      jobId: job.id,
      researchSourceId: job.data.researchSourceId,
    });
  });

  worker.on("failed", (job, error) => {
    params.logger.error("keyword extraction job failed", {
      jobId: job?.id,
      researchSourceId: job?.data.researchSourceId,
      error,
    });
  });

  return worker;
}
