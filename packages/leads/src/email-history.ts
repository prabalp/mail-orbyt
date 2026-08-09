import type { PrismaClient } from "@mail-orbyt/database";

type EmailHistoryPrisma = Pick<PrismaClient, "outboxItem">;

export interface LeadEmailHistoryEntry {
  id: string;
  status: string;
  subject: string | null;
  body: string | null;
  /** When it actually left the mailbox (null until SENT). */
  sentAt: Date | null;
  /** When it was queued to go out — the meaningful timestamp while status is still SCHEDULED. */
  scheduledFor: Date;
  lastError: string | null;
  attempts: number;
  campaign: { id: string; name: string };
  step: { id: string; orderIndex: number; stepType: string };
  inbox: { id: string; emailAddress: string } | null;
  providerMessageId: string | null;
  providerThreadId: string | null;
}

/**
 * Every email this campaign machinery has aimed at one lead — sent, queued,
 * failed, or skipped — newest first.
 *
 * The OutboxItem row is the record: its subject/body are materialized once at
 * send time and never regenerated, so what's returned here is byte-identical
 * to what the prospect received rather than a re-render of the template.
 * Items that never left (FAILED, SKIPPED_SUPPRESSED, CANCELLED) are included
 * deliberately — "why did this lead never hear from us" is the same question
 * as "what did we send them", and hiding the non-sends makes it unanswerable.
 */
export async function listLeadEmailHistory(
  prisma: EmailHistoryPrisma,
  organisationId: string,
  leadId: string,
): Promise<LeadEmailHistoryEntry[]> {
  const items = await prisma.outboxItem.findMany({
    where: { organisationId, leadId },
    include: {
      campaign: { select: { id: true, name: true } },
      campaignStep: { select: { id: true, orderIndex: true, stepType: true } },
      inbox: { select: { id: true, emailAddress: true } },
    },
    // Queued-but-unsent items have no sentAt, so they'd sink to one end under a
    // plain sentAt sort; scheduledFor is the timestamp every row always has.
    orderBy: [{ sentAt: "desc" }, { scheduledFor: "desc" }],
  });

  return items.map((item) => ({
    id: item.id,
    status: item.status,
    subject: item.subject,
    body: item.body,
    sentAt: item.sentAt,
    scheduledFor: item.scheduledFor,
    lastError: item.lastError,
    attempts: item.attempts,
    campaign: item.campaign,
    step: item.campaignStep,
    inbox: item.inbox,
    providerMessageId: item.providerMessageId,
    providerThreadId: item.providerThreadId,
  }));
}
