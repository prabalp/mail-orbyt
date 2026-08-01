import { Queue, type ConnectionOptions } from "bullmq";

export const RESEARCH_KEYWORDS_QUEUE_NAME = "research-keywords";

export interface ResearchKeywordsJobData {
  researchSourceId: string;
  organisationId: string;
}

let queue: Queue<ResearchKeywordsJobData> | undefined;

export function getResearchKeywordsQueue(
  connection: ConnectionOptions,
): Queue<ResearchKeywordsJobData> {
  if (!queue) {
    queue = new Queue<ResearchKeywordsJobData>(RESEARCH_KEYWORDS_QUEUE_NAME, { connection });
  }
  return queue;
}

/**
 * No stable jobId here (unlike enqueueResearchJob) — re-running keyword
 * extraction on demand for the same source is the whole point of this
 * queue, so each call should be its own job rather than deduping against a
 * prior run.
 */
export async function enqueueResearchKeywordsJob(
  connection: ConnectionOptions,
  data: ResearchKeywordsJobData,
): Promise<void> {
  const queueInstance = getResearchKeywordsQueue(connection);
  await queueInstance.add("extract-keywords", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
}
