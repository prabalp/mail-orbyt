import type { PrismaClient } from "@mail-orbyt/database";
import {
  LEAD_IMPORT_QUEUE_NAME,
  processImportBatch,
  type LeadImportJobData,
} from "@mail-orbyt/leads";
import type { Logger } from "@mail-orbyt/logging";
import type { ObjectStorage } from "@mail-orbyt/storage";
import { Worker, type ConnectionOptions, type Job } from "bullmq";

export function createLeadImportWorker(params: {
  connection: ConnectionOptions;
  prisma: PrismaClient;
  storage: ObjectStorage;
  logger: Logger;
}): Worker<LeadImportJobData> {
  const worker = new Worker<LeadImportJobData>(
    LEAD_IMPORT_QUEUE_NAME,
    async (job: Job<LeadImportJobData>) => {
      params.logger.info("processing lead import batch", {
        jobId: job.id,
        importBatchId: job.data.importBatchId,
      });
      try {
        await processImportBatch(params.prisma, params.storage, job.data.importBatchId);
      } catch (error) {
        await params.prisma.importBatch.update({
          where: { id: job.data.importBatchId },
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
    params.logger.info("lead import batch completed", {
      jobId: job.id,
      importBatchId: job.data.importBatchId,
    });
  });

  worker.on("failed", (job, error) => {
    params.logger.error("lead import batch failed", {
      jobId: job?.id,
      importBatchId: job?.data.importBatchId,
      error,
    });
  });

  return worker;
}
