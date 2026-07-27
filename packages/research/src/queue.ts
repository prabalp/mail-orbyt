import { Queue, type ConnectionOptions } from "bullmq";

export const RESEARCH_QUEUE_NAME = "research";

export interface ResearchJobData {
  researchJobId: string;
}

let queue: Queue<ResearchJobData> | undefined;

export function getResearchQueue(connection: ConnectionOptions): Queue<ResearchJobData> {
  if (!queue) {
    queue = new Queue<ResearchJobData>(RESEARCH_QUEUE_NAME, { connection });
  }
  return queue;
}

/** Stable jobId derived from the research job's own ID — enqueuing the same job twice reuses the same BullMQ job (see docs/queue-architecture.md for why this matters and why "-" not ":" is used). */
export async function enqueueResearchJob(
  connection: ConnectionOptions,
  data: ResearchJobData,
): Promise<void> {
  const queueInstance = getResearchQueue(connection);
  await queueInstance.add("process-research-job", data, {
    jobId: `research-job-${data.researchJobId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
}
