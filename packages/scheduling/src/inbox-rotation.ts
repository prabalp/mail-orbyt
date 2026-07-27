import type { Inbox, PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "campaignInbox" | "outboxItem">;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Picks the least-recently-used CONNECTED inbox in a campaign's pool that
 * hasn't hit its dailySendLimit yet — "least sent today" naturally produces
 * round-robin rotation across the pool without needing a separate cursor to
 * track. Sent-today is counted in UTC (a documented simplification — a
 * per-inbox local-timezone day boundary would need to know the inbox
 * owner's timezone, which isn't tracked). Returns null if every inbox in
 * the pool is disconnected or exhausted for the day, so the caller can
 * defer the send rather than force it through an over-limit inbox.
 */
export async function pickNextInbox(
  prisma: Prisma,
  campaignId: string,
  atDate: Date = new Date(),
): Promise<Inbox | null> {
  const pool = await prisma.campaignInbox.findMany({
    where: { campaignId, inbox: { status: "CONNECTED" } },
    include: { inbox: true },
  });
  if (pool.length === 0) return null;

  const dayStart = startOfUtcDay(atDate);

  const counts = await Promise.all(
    pool.map(({ inbox }) =>
      prisma.outboxItem.count({
        where: { inboxId: inbox.id, status: "SENT", sentAt: { gte: dayStart } },
      }),
    ),
  );

  const eligible = pool
    .map(({ inbox }, index) => ({ inbox, count: counts[index] ?? 0 }))
    .filter(({ inbox, count }) => count < inbox.dailySendLimit);

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => a.count - b.count);
  return eligible[0]!.inbox;
}
