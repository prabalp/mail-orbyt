import { Queue, type ConnectionOptions } from "bullmq";

export const SOCIAL_POLL_QUEUE_NAME = "social-event-polling";
export const SOCIAL_EVENT_PROCESSING_QUEUE_NAME = "social-event-processing";
export const SOCIAL_PUBLISH_QUEUE_NAME = "social-publish";

const POLL_INTERVAL_MS = 5 * 60_000;
const PUBLISH_MAX_ATTEMPTS = 5;
const PUBLISH_BACKOFF_DELAY_MS = 30_000;

export interface SocialEventProcessingJobData {
  socialInboundEventId: string;
}

export interface SocialPublishJobData {
  socialActionId: string;
}

let pollQueue: Queue | undefined;
let eventProcessingQueue: Queue<SocialEventProcessingJobData> | undefined;
let publishQueue: Queue<SocialPublishJobData> | undefined;

export function getSocialPollQueue(connection: ConnectionOptions): Queue {
  if (!pollQueue) {
    pollQueue = new Queue(SOCIAL_POLL_QUEUE_NAME, { connection });
  }
  return pollQueue;
}

/** Registers the repeatable ~5 minute tick that polls every connected social account for new mentions/comments/DMs. Safe to call on every worker boot — BullMQ dedupes repeatable jobs by their scheduler id. */
export async function scheduleSocialPollTick(connection: ConnectionOptions): Promise<void> {
  const queue = getSocialPollQueue(connection);
  await queue.upsertJobScheduler(
    "social-event-poll-tick",
    { every: POLL_INTERVAL_MS },
    { name: "tick", data: {} },
  );
}

export function getSocialEventProcessingQueue(
  connection: ConnectionOptions,
): Queue<SocialEventProcessingJobData> {
  if (!eventProcessingQueue) {
    eventProcessingQueue = new Queue<SocialEventProcessingJobData>(SOCIAL_EVENT_PROCESSING_QUEUE_NAME, {
      connection,
    });
  }
  return eventProcessingQueue;
}

/** Stable jobId derived from the SocialInboundEvent's own id — enqueuing the same event twice (e.g. a webhook retry racing a poll tick) reuses the same BullMQ job rather than double-processing it. */
export async function enqueueSocialEventProcessing(
  connection: ConnectionOptions,
  data: SocialEventProcessingJobData,
): Promise<void> {
  const queue = getSocialEventProcessingQueue(connection);
  await queue.add("process", data, {
    jobId: `social-event-${data.socialInboundEventId}`,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  });
}

export function getSocialPublishQueue(connection: ConnectionOptions): Queue<SocialPublishJobData> {
  if (!publishQueue) {
    publishQueue = new Queue<SocialPublishJobData>(SOCIAL_PUBLISH_QUEUE_NAME, { connection });
  }
  return publishQueue;
}

/**
 * Stable jobId derived from the SocialAction's own id. Retries with
 * exponential backoff on failure (see apps/worker/src/queues/social-publish.ts)
 * so a rate-limit-exceeded result gets a few chances to drain before the
 * worker gives up and escalates the action for human review instead of
 * looping forever or silently dropping it.
 */
export async function enqueueSocialPublishJob(
  connection: ConnectionOptions,
  data: SocialPublishJobData,
): Promise<void> {
  const queue = getSocialPublishQueue(connection);
  await queue.add("publish", data, {
    jobId: `social-action-${data.socialActionId}`,
    attempts: PUBLISH_MAX_ATTEMPTS,
    backoff: { type: "exponential", delay: PUBLISH_BACKOFF_DELAY_MS },
    removeOnComplete: true,
    removeOnFail: true,
  });
}
