import { Queue, type ConnectionOptions } from "bullmq";

export const LEAD_IMPORT_QUEUE_NAME = "lead-import";

export interface LeadImportJobData {
  importBatchId: string;
}

let queue: Queue<LeadImportJobData> | undefined;

/** Lazily constructs (and reuses) the BullMQ queue producer. The worker process registers the corresponding consumer — see apps/worker. */
export function getLeadImportQueue(connection: ConnectionOptions): Queue<LeadImportJobData> {
  if (!queue) {
    queue = new Queue<LeadImportJobData>(LEAD_IMPORT_QUEUE_NAME, { connection });
  }
  return queue;
}

/**
 * Enqueues import processing with a jobId derived from the batch ID, so
 * accidentally enqueuing the same batch twice (e.g. a double-click, a retried
 * API request) reuses the same BullMQ job instead of running the import
 * twice concurrently.
 */
export async function enqueueImportJob(
  connection: ConnectionOptions,
  data: LeadImportJobData,
): Promise<void> {
  const queueInstance = getLeadImportQueue(connection);
  await queueInstance.add("process-import-batch", data, {
    // BullMQ job IDs cannot contain ":" (throws at add-time) — a real bug
    // caught only by actually enqueuing a job against real Redis, not by
    // any mocked test.
    jobId: `import-batch-${data.importBatchId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
}
