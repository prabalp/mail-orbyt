import type { PrismaClient } from "@mail-orbyt/database";
import { isSuppressed } from "@mail-orbyt/leads";
import type { AiEmailGenerator } from "@mail-orbyt/email-generation";
import { resolveDefaultSignatureText, resolveInboxSenderName } from "@mail-orbyt/gmail";
import { scheduleNextStepForEnrollment } from "./enrollment-progression";
import { pickNextInbox } from "./inbox-rotation";
import { materializeStepContent } from "./content";

type Prisma = Pick<
  PrismaClient,
  | "campaignEnrollment"
  | "campaignStep"
  | "outboxItem"
  | "campaignInbox"
  | "suppressionEntry"
  | "auditEvent"
  | "researchFact"
  | "researchSnapshot"
  | "researchSource"
  | "researchPageText"
  | "signature"
  | "inbox"
>;

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 5 * 60_000;
const DEFER_WHEN_NO_INBOX_MS = 60 * 60_000;

/** Ensures every ACTIVE campaign's PENDING/ACTIVE enrollments have their next due OutboxItem scheduled. Safe to call repeatedly (e.g. every scheduler tick) — scheduleNextStepForEnrollment is itself idempotent. */
export async function enqueueDueOutboxItems(
  prisma: Pick<PrismaClient, "campaignEnrollment" | "campaignStep" | "outboxItem">,
) {
  const enrollments = await prisma.campaignEnrollment.findMany({
    where: { status: { in: ["PENDING", "ACTIVE"] }, campaign: { status: "ACTIVE" } },
    select: { id: true },
  });

  let scheduled = 0;
  for (const enrollment of enrollments) {
    const created = await scheduleNextStepForEnrollment(prisma, enrollment.id);
    if (created) scheduled += 1;
  }
  return { scheduled, considered: enrollments.length };
}

export interface ProcessOutboxItemDeps {
  aiGenerator: AiEmailGenerator | undefined;
  sendEmail: (
    inboxId: string,
    message: { to: string; subject: string; body: string },
  ) => Promise<{ messageId: string; threadId: string }>;
  /**
   * Resolves organisation-level context for AI-generated copy — deferred to
   * a callback rather than static strings, since each OutboxItem's campaign
   * can belong to a different organisation. Sender NAME is deliberately not
   * part of this — it comes from whichever inbox this send actually goes
   * out from (see resolveInboxSenderName below), not the organisation.
   */
  getSenderContext: (organisationId: string) => Promise<{
    senderCompanyName: string;
    customInstructions?: string;
    bookingLink?: string;
    generationSystemPromptOverride?: string;
    reviewSystemPromptOverride?: string;
  }>;
  emergencyStop: boolean;
  now?: Date;
}

/**
 * Processes a single OutboxItem. Idempotent: an item not in SCHEDULED
 * status is a no-op (already sent, already failed terminally, already
 * skipped) — retriggering the same BullMQ job never double-sends. Order of
 * checks matters: emergency stop and suppression are re-checked at send
 * time (not just at enrollment time), since either can change between
 * scheduling and the actual send.
 */
export async function processOutboxItem(
  prisma: Prisma,
  deps: ProcessOutboxItemDeps,
  itemId: string,
) {
  const item = await prisma.outboxItem.findUnique({
    where: { id: itemId },
    include: { lead: true, campaign: true, campaignStep: true, enrollment: true },
  });
  if (!item) return null;
  if (item.status !== "SCHEDULED") return item;

  if (deps.emergencyStop) {
    return item;
  }

  if (item.lead.email && (await isSuppressed(prisma, item.organisationId, item.lead.email))) {
    const [updatedItem] = await Promise.all([
      prisma.outboxItem.update({ where: { id: item.id }, data: { status: "SKIPPED_SUPPRESSED" } }),
      prisma.campaignEnrollment.update({
        where: { id: item.enrollmentId },
        data: {
          status: "SUPPRESSED",
          exitedAt: deps.now ?? new Date(),
          exitReason: "Suppressed at send time",
        },
      }),
    ]);
    return updatedItem;
  }

  if (!item.lead.email) {
    return prisma.outboxItem.update({
      where: { id: item.id },
      data: { status: "FAILED", lastError: "Lead has no email address." },
    });
  }

  const inbox = await pickNextInbox(prisma, item.campaignId, deps.now ?? new Date());
  if (!inbox) {
    return prisma.outboxItem.update({
      where: { id: item.id },
      data: { scheduledFor: new Date((deps.now ?? new Date()).getTime() + DEFER_WHEN_NO_INBOX_MS) },
    });
  }

  let subject = item.subject;
  let body = item.body;
  if (!subject || !body) {
    let priorEmail: { subject: string; body: string } | undefined;
    if (item.campaignStep.orderIndex > 0) {
      const priorStep = await prisma.campaignStep.findUnique({
        where: {
          campaignId_orderIndex: {
            campaignId: item.campaignId,
            orderIndex: item.campaignStep.orderIndex - 1,
          },
        },
      });
      if (priorStep) {
        const priorItem = await prisma.outboxItem.findUnique({
          where: {
            campaignId_leadId_campaignStepId: {
              campaignId: item.campaignId,
              leadId: item.leadId,
              campaignStepId: priorStep.id,
            },
          },
        });
        if (priorItem?.subject && priorItem.body) {
          priorEmail = { subject: priorItem.subject, body: priorItem.body };
        }
      }
    }

    const [
      { senderCompanyName, customInstructions, bookingLink, generationSystemPromptOverride, reviewSystemPromptOverride },
      signatureText,
    ] = await Promise.all([
      deps.getSenderContext(item.organisationId),
      resolveDefaultSignatureText(prisma, inbox.id),
    ]);
    const generated = await materializeStepContent(prisma, {
      organisationId: item.organisationId,
      lead: item.lead,
      step: item.campaignStep,
      senderName: resolveInboxSenderName(inbox),
      senderCompanyName,
      priorEmail,
      aiGenerator: deps.aiGenerator,
      customInstructions,
      bookingLink,
      signatureText,
      generationSystemPromptOverride,
      reviewSystemPromptOverride,
    });
    subject = generated.subject;
    body = generated.body;
    await prisma.outboxItem.update({ where: { id: item.id }, data: { subject, body } });
  }

  await prisma.outboxItem.update({
    where: { id: item.id },
    data: { status: "SENDING", inboxId: inbox.id },
  });

  try {
    const result = await deps.sendEmail(inbox.id, { to: item.lead.email, subject, body });
    const sentAt = deps.now ?? new Date();

    const [updatedItem] = await Promise.all([
      prisma.outboxItem.update({
        where: { id: item.id },
        data: {
          status: "SENT",
          sentAt,
          providerMessageId: result.messageId,
          providerThreadId: result.threadId,
        },
      }),
      prisma.campaignEnrollment.update({
        where: { id: item.enrollmentId },
        data: { status: "ACTIVE", currentStepIndex: { increment: 1 }, lastStepSentAt: sentAt },
      }),
    ]);

    await scheduleNextStepForEnrollment(prisma, item.enrollmentId);
    return updatedItem;
  } catch (error) {
    const attempts = item.attempts + 1;
    const terminal = attempts >= MAX_ATTEMPTS;
    return prisma.outboxItem.update({
      where: { id: item.id },
      data: {
        status: terminal ? "FAILED" : "SCHEDULED",
        attempts,
        lastError: error instanceof Error ? error.message : String(error),
        scheduledFor: terminal
          ? item.scheduledFor
          : new Date((deps.now ?? new Date()).getTime() + RETRY_BACKOFF_MS),
      },
    });
  }
}
