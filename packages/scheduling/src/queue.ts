import { Queue, type ConnectionOptions } from "bullmq";

export const SCHEDULER_QUEUE_NAME = "campaign-scheduler";
export const OUTBOX_QUEUE_NAME = "outbox";

export interface OutboxJobData {
  outboxItemId: string;
}

let schedulerQueue: Queue | undefined;
let outboxQueue: Queue<OutboxJobData> | undefined;

export function getSchedulerQueue(connection: ConnectionOptions): Queue {
  if (!schedulerQueue) {
    schedulerQueue = new Queue(SCHEDULER_QUEUE_NAME, { connection });
  }
  return schedulerQueue;
}

/** Registers the repeatable "tick" job that calls enqueueDueOutboxItems every minute. Safe to call on every worker boot — BullMQ dedupes repeatable jobs by their repeat pattern + jobId. */
export async function scheduleRecurringTick(connection: ConnectionOptions): Promise<void> {
  const queue = getSchedulerQueue(connection);
  await queue.upsertJobScheduler(
    "campaign-scheduler-tick",
    { every: 60_000 },
    { name: "tick", data: {} },
  );
}

export function getOutboxQueue(connection: ConnectionOptions): Queue<OutboxJobData> {
  if (!outboxQueue) {
    outboxQueue = new Queue<OutboxJobData>(OUTBOX_QUEUE_NAME, { connection });
  }
  return outboxQueue;
}

/** Stable jobId derived from the OutboxItem's own id — enqueuing the same item twice reuses the same BullMQ job, so a scheduler re-run never double-enqueues a send. */
export async function enqueueOutboxItem(
  connection: ConnectionOptions,
  data: OutboxJobData,
  delayMs = 0,
): Promise<void> {
  const queue = getOutboxQueue(connection);
  await queue.add("send", data, {
    jobId: `outbox-item-${data.outboxItemId}`,
    delay: delayMs,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
  });
}
