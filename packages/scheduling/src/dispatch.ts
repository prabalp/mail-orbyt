import type { PrismaClient } from "@mail-orbyt/database";
import type { ConnectionOptions } from "bullmq";
import { enqueueOutboxItem } from "./queue";

/** How far ahead of `now` an item is handed to the queue, as a delayed job, rather than left for a later pass. Matches the scheduler tick interval, so every item is dispatched exactly once, by the tick immediately before it falls due. */
export const OUTBOX_LOOKAHEAD_MS = 60_000;

/**
 * Hands every OutboxItem due within the lookahead to the outbox queue, each
 * with a delay matching its own send time.
 *
 * Shared by the 60s scheduler tick and the campaign resume path: reactivating
 * a campaign is otherwise only a column write, and sending would not visibly
 * restart until the next tick came round. Enqueuing is idempotent (see the
 * stable jobId in enqueueOutboxItem), so an item dispatched here and again by
 * the following tick is still sent once.
 */
export async function dispatchDueOutboxItems(
  prisma: Pick<PrismaClient, "outboxItem">,
  connection: ConnectionOptions,
  options: { campaignId?: string; lookaheadMs?: number; now?: Date } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const lookaheadMs = options.lookaheadMs ?? OUTBOX_LOOKAHEAD_MS;

  const due = await prisma.outboxItem.findMany({
    where: {
      status: "SCHEDULED",
      scheduledFor: { lte: new Date(now.getTime() + lookaheadMs) },
      ...(options.campaignId ? { campaignId: options.campaignId } : {}),
    },
    select: { id: true, scheduledFor: true },
  });

  for (const item of due) {
    const delayMs = Math.max(0, item.scheduledFor.getTime() - now.getTime());
    await enqueueOutboxItem(connection, { outboxItemId: item.id }, delayMs);
  }

  return due.length;
}
