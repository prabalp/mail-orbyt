import type { PrismaClient } from "@mail-orbyt/database";
import type { ThreadMessage } from "@mail-orbyt/gmail";
import { addSuppressionEntry } from "@mail-orbyt/leads";
import { classifyReply } from "./reply-classifier";

export type FetchThreadFn = (
  prisma: PrismaClient,
  inboxId: string,
  gmailThreadId: string,
) => Promise<ThreadMessage[]>;

function parseFromAddress(fromHeader: string): string {
  const match = /<([^>]+)>/.exec(fromHeader);
  return (match?.[1] ?? fromHeader).trim().toLowerCase();
}

export interface SyncRepliesResult {
  newReplies: number;
  conversationId: string | null;
}

/**
 * Checks a sent OutboxItem's Gmail thread for replies not yet recorded.
 * Any genuine reply (from the lead, not our own inbox) exits the
 * enrollment immediately — replying to any step always hands control to a
 * human, regardless of what the reply says or how it's classified. This
 * is a deliberate product safety rule, not an optimization: automation
 * must never keep emailing someone who has already responded.
 */
export async function syncRepliesForOutboxItem(
  prisma: PrismaClient,
  fetchThread: FetchThreadFn,
  outboxItemId: string,
): Promise<SyncRepliesResult> {
  const item = await prisma.outboxItem.findUnique({
    where: { id: outboxItemId },
    include: { lead: true },
  });
  if (!item || item.status !== "SENT" || !item.providerThreadId || !item.inboxId) {
    return { newReplies: 0, conversationId: null };
  }

  const inbox = await prisma.inbox.findUniqueOrThrow({ where: { id: item.inboxId } });
  const messages = await fetchThread(prisma, item.inboxId, item.providerThreadId);

  const replies = messages.filter(
    (message) => parseFromAddress(message.from) !== inbox.emailAddress.toLowerCase(),
  );
  if (replies.length === 0) {
    return { newReplies: 0, conversationId: null };
  }

  const conversation = await prisma.conversation.upsert({
    where: {
      organisationId_leadId_inboxId: {
        organisationId: item.organisationId,
        leadId: item.leadId,
        inboxId: item.inboxId,
      },
    },
    create: {
      organisationId: item.organisationId,
      leadId: item.leadId,
      inboxId: item.inboxId,
      gmailThreadId: item.providerThreadId,
      subject: item.subject,
      lastMessageAt: new Date(),
    },
    update: { lastMessageAt: new Date() },
  });

  let newReplies = 0;
  for (const reply of replies) {
    const existing = await prisma.conversationMessage.findUnique({
      where: {
        conversationId_gmailMessageId: {
          conversationId: conversation.id,
          gmailMessageId: reply.gmailMessageId,
        },
      },
    });
    if (existing) continue;

    const classification = classifyReply(reply.subject, reply.snippet);

    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        gmailMessageId: reply.gmailMessageId,
        classification,
        snippet: reply.snippet,
        occurredAt: reply.internalDate,
      },
    });
    newReplies += 1;

    // An unsubscribe request must take effect immediately and permanently
    // — added to the canonical suppression list so every future campaign
    // (not just this one) re-checks and respects it at send time.
    if (classification === "UNSUBSCRIBE_REQUEST" && item.lead.email) {
      await addSuppressionEntry(prisma, {
        organisationId: item.organisationId,
        type: "EMAIL",
        value: item.lead.email,
        reason: "UNSUBSCRIBE",
      });
    }
  }

  if (newReplies > 0) {
    await prisma.campaignEnrollment.update({
      where: { id: item.enrollmentId },
      data: { status: "EXITED", exitedAt: new Date(), exitReason: "Lead replied" },
    });
  }

  return { newReplies, conversationId: conversation.id };
}
