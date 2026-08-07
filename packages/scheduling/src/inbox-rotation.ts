import type { Inbox, PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "campaignInbox" | "outboxItem" | "inbox">;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export interface InboxSelection {
  /** The inbox to send from, with its cooldown slot already claimed. Null when nothing is sendable right now. */
  inbox: Inbox | null;
  /**
   * Only set alongside `inbox: null`: an inbox exists and is under its daily
   * limit, but is cooling down until this moment. Lets the caller reschedule
   * for exactly when sending becomes possible instead of guessing.
   */
  availableAt?: Date;
}

/**
 * Picks the least-recently-used CONNECTED inbox in a campaign's pool that
 * hasn't hit its dailySendLimit yet — "least sent today" naturally produces
 * round-robin rotation across the pool without needing a separate cursor to
 * track. Sent-today is counted in UTC (a documented simplification — a
 * per-inbox local-timezone day boundary would need to know the inbox
 * owner's timezone, which isn't tracked).
 *
 * When `cooldownMinutes` > 0, an inbox that sent recently is skipped until
 * its cooldown expires, and the returned inbox has its next slot CLAIMED:
 * `sendCooldownUntil` is bumped as part of picking it, via a conditional
 * UPDATE that only matches a row still outside its cooldown. That
 * compare-and-set is what makes the throttle hold under concurrency — four
 * outbox workers racing for the same inbox produce exactly one winner,
 * whereas a plain read-then-check would let all four through. The cooldown
 * is per inbox only: two inboxes in the pool can each send at the same
 * instant, they just can't each send twice.
 *
 * Returns `{ inbox: null }` if every inbox in the pool is disconnected or
 * exhausted for the day, so the caller can defer the send rather than force
 * it through an over-limit inbox — with `availableAt` set instead when the
 * only thing blocking the send is a cooldown that will expire.
 */
export async function pickNextInbox(
  prisma: Prisma,
  campaignId: string,
  atDate: Date = new Date(),
  cooldownMinutes = 0,
): Promise<InboxSelection> {
  const pool = await prisma.campaignInbox.findMany({
    where: { campaignId, inbox: { status: "CONNECTED" } },
    include: { inbox: true },
  });
  if (pool.length === 0) return { inbox: null };

  const dayStart = startOfUtcDay(atDate);

  const counts = await Promise.all(
    pool.map(({ inbox }) =>
      prisma.outboxItem.count({
        where: { inboxId: inbox.id, status: "SENT", sentAt: { gte: dayStart } },
      }),
    ),
  );

  const underLimit = pool
    .map(({ inbox }, index) => ({ inbox, count: counts[index] ?? 0 }))
    .filter(({ inbox, count }) => count < inbox.dailySendLimit)
    .sort((a, b) => a.count - b.count);

  if (underLimit.length === 0) return { inbox: null };

  const cooldownMs = Math.max(0, cooldownMinutes) * 60_000;
  if (cooldownMs === 0) return { inbox: underLimit[0]!.inbox };

  const cooldownUntil = new Date(atDate.getTime() + cooldownMs);
  for (const { inbox } of underLimit) {
    if (inbox.sendCooldownUntil && inbox.sendCooldownUntil > atDate) continue;
    const claimed = await prisma.inbox.updateMany({
      where: {
        id: inbox.id,
        OR: [{ sendCooldownUntil: null }, { sendCooldownUntil: { lte: atDate } }],
      },
      data: { sendCooldownUntil: cooldownUntil },
    });
    if (claimed.count > 0) return { inbox: { ...inbox, sendCooldownUntil: cooldownUntil } };
  }

  return { inbox: null, availableAt: await earliestCooldownEnd(prisma, underLimit, atDate) };
}

/**
 * Re-reads cooldowns rather than reusing the ones read above, because losing
 * a claim race means another worker just moved them — a stale read here
 * would reschedule the item into the past and spin.
 */
async function earliestCooldownEnd(
  prisma: Pick<PrismaClient, "inbox">,
  candidates: { inbox: Inbox }[],
  atDate: Date,
): Promise<Date> {
  const fresh = await prisma.inbox.findMany({
    where: { id: { in: candidates.map(({ inbox }) => inbox.id) } },
    select: { sendCooldownUntil: true },
  });
  const times = fresh
    .map((row) => row.sendCooldownUntil?.getTime())
    .filter((time): time is number => time !== undefined && time > atDate.getTime());
  // Every candidate free yet none claimable can only mean a race we just
  // lost; a second is enough of a nudge to try again.
  if (times.length === 0) return new Date(atDate.getTime() + 1_000);
  return new Date(Math.min(...times));
}

/**
 * Re-anchors an inbox's cooldown to the moment a send actually completed.
 * pickNextInbox claims the slot from the moment of PICKING, which is before
 * AI content generation and the Gmail API call — without this, a slow send
 * would eat into its own cooldown and the real gap between two emails would
 * be shorter than configured.
 */
export async function markInboxSent(
  prisma: Pick<PrismaClient, "inbox">,
  inboxId: string,
  sentAt: Date,
  cooldownMinutes: number,
): Promise<void> {
  const cooldownMs = Math.max(0, cooldownMinutes) * 60_000;
  if (cooldownMs === 0) return;
  await prisma.inbox.update({
    where: { id: inboxId },
    data: { sendCooldownUntil: new Date(sentAt.getTime() + cooldownMs) },
  });
}
