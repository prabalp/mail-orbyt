import type { PrismaClient } from "@mail-orbyt/database";
import { isSuppressed } from "@mail-orbyt/leads";
import type { AiEmailGenerator } from "@mail-orbyt/email-generation";
import { resolveDefaultSignatureText, resolveInboxSenderName } from "@mail-orbyt/gmail";
import { buildPixelImgTag, getVerifiedTrackingDomain } from "@mail-orbyt/tracking";
import { scheduleNextStepForEnrollment } from "./enrollment-progression";
import { journeyStateAfterSend } from "./journey";
import { markInboxSent, pickNextInbox } from "./inbox-rotation";
import { materializeStepContent, MissingImportedEmailError } from "./content";
import { nextSendableTime } from "./sending-window";

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
  | "leadImportedEmail"
  | "enrollmentRoutingDecision"
  | "signature"
  | "inbox"
  | "trackingDomain"
>;

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 5 * 60_000;
const DEFER_WHEN_NO_INBOX_MS = 60 * 60_000;

/** Ensures every ACTIVE campaign's PENDING/ACTIVE enrollments have their next due OutboxItem scheduled. Safe to call repeatedly (e.g. every scheduler tick) — scheduleNextStepForEnrollment is itself idempotent. Pass `campaignId` to narrow it to one campaign, as the resume path does: reactivating one campaign should not walk every organisation's enrollments. */
export async function enqueueDueOutboxItems(
  prisma: Pick<
    PrismaClient,
    | "campaignEnrollment"
    | "campaignStep"
    | "outboxItem"
    | "leadImportedEmail"
    | "enrollmentRoutingDecision"
  >,
  options: { campaignId?: string } = {},
) {
  const enrollments = await prisma.campaignEnrollment.findMany({
    where: {
      status: { in: ["PENDING", "ACTIVE"] },
      campaign: { status: "ACTIVE" },
      ...(options.campaignId ? { campaignId: options.campaignId } : {}),
    },
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
  /**
   * Resolves the AI generator for a given organisation, rather than taking
   * one fixed generator: an organisation can supply its own provider key and
   * model in Settings, and a worker processes items for many organisations,
   * so which credentials to use isn't known until the item's organisation
   * is. Returns undefined when neither the organisation nor the environment
   * has a key configured, which callers treat as "AI steps can't run".
   */
  resolveAiGenerator: (organisationId: string) => Promise<AiEmailGenerator | undefined>;
  sendEmail: (
    inboxId: string,
    message: { to: string; subject: string; body: string; pixelImgTag?: string },
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
    campaignPrompt?: string;
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

  // Pause has to hold at SEND time, not just at scheduling time: the scheduler
  // dispatches every due SCHEDULED item regardless of which campaign it belongs
  // to, so without this a paused campaign keeps sending everything already
  // queued and only looks paused once that backlog drains. The item is left
  // SCHEDULED and otherwise untouched, so resuming picks it straight back up.
  if (item.campaign.status !== "ACTIVE") return item;

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

  const now = deps.now ?? new Date();
  const cooldownMinutes = item.campaign.inboxCooldownMinutes;
  const selection = await pickNextInbox(prisma, item.campaignId, now, cooldownMinutes);
  const inbox = selection.inbox;
  if (!inbox) {
    // A cooldown is a known-short wait, so reschedule for the moment it
    // lifts (clamped back into the campaign's sending window, in case the
    // gap pushes past the end of the day). Anything else — no pool, all
    // disconnected, daily limits reached — has no such known end.
    const deferUntil = selection.availableAt
      ? nextSendableTime(item.campaign, selection.availableAt)
      : new Date(now.getTime() + DEFER_WHEN_NO_INBOX_MS);
    return prisma.outboxItem.update({
      where: { id: item.id },
      data: { scheduledFor: deferUntil },
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
            campaignId_leadId_campaignStepId_sendNo: {
              campaignId: item.campaignId,
              leadId: item.leadId,
              campaignStepId: priorStep.id,
              sendNo: 0,
            },
          },
        });
        if (priorItem?.subject && priorItem.body) {
          priorEmail = { subject: priorItem.subject, body: priorItem.body };
        }
      }
    }

    const [
      {
        senderCompanyName,
        campaignPrompt,
        bookingLink,
        generationSystemPromptOverride,
        reviewSystemPromptOverride,
      },
      signatureText,
      aiGenerator,
    ] = await Promise.all([
      deps.getSenderContext(item.organisationId),
      resolveDefaultSignatureText(prisma, item.organisationId),
      deps.resolveAiGenerator(item.organisationId),
    ]);
    let generated: { subject: string; body: string };
    try {
      generated = await materializeStepContent(prisma, {
        organisationId: item.organisationId,
        lead: item.lead,
        step: item.campaignStep,
        nodeKey: item.nodeKey ?? undefined,
        senderName: resolveInboxSenderName(inbox),
        senderCompanyName,
        priorEmail,
        aiGenerator,
        // A campaign's own prompt replaces the organisation's rather than
        // stacking with it — two sets of data/format/voice guidance in one
        // prompt contradict each other as often as they compose. Neither set
        // falls back to DEFAULT_CAMPAIGN_EMAIL_PROMPT here; that happens in
        // buildGenerateEmailPrompt, so there is exactly one such fallback.
        campaignPrompt: item.campaign.emailPromptInstructions?.trim() || campaignPrompt,
        bookingLink,
        signatureText,
        generationSystemPromptOverride,
        reviewSystemPromptOverride,
      });
    } catch (error) {
      if (error instanceof MissingImportedEmailError) {
        return prisma.outboxItem.update({
          where: { id: item.id },
          data: { status: "FAILED", lastError: error.message },
        });
      }
      throw error;
    }
    subject = generated.subject;
    body = generated.body;
    await prisma.outboxItem.update({ where: { id: item.id }, data: { subject, body } });
  }

  await prisma.outboxItem.update({
    where: { id: item.id },
    data: { status: "SENDING", inboxId: inbox.id },
  });

  try {
    const trackingDomain = await getVerifiedTrackingDomain(prisma, item.organisationId);
    const pixelImgTag = trackingDomain ? buildPixelImgTag(trackingDomain, item.id) : undefined;
    const result = await deps.sendEmail(inbox.id, {
      to: item.lead.email,
      subject,
      body,
      pixelImgTag,
    });
    const sentAt = deps.now ?? new Date();
    // Deliberately swallowed: the email is already gone, so letting this
    // throw into the catch below would mark a completed send as retryable
    // and double-send it. The claim pickNextInbox already wrote stands as a
    // slightly-early approximation if this re-anchoring fails.
    try {
      await markInboxSent(prisma, inbox.id, sentAt, cooldownMinutes);
    } catch {
      // ignored
    }

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
        data: {
          status: "ACTIVE",
          currentStepIndex: { increment: 1 },
          lastStepSentAt: sentAt,
          ...(item.nodeKey
            ? await journeyStateAfterSend(prisma, item.enrollmentId, item.nodeKey, sentAt)
            : {}),
        },
      }),
    ]);

    await scheduleNextStepForEnrollment(prisma, item.enrollmentId);
    return updatedItem;
  } catch (error) {
    // The cooldown claim is intentionally left in place on failure: a failed
    // send may still have reached the provider, and the retry is RETRY_BACKOFF_MS
    // out anyway, so the claim expires on its own well before then.
    const attempts = item.attempts + 1;
    const terminal = attempts >= MAX_ATTEMPTS;
    return prisma.outboxItem.update({
      where: { id: item.id },
      data: {
        status: terminal ? "FAILED" : "SCHEDULED",
        attempts,
        lastError: error instanceof Error ? error.message : String(error),
        scheduledFor: terminal ? item.scheduledFor : new Date(now.getTime() + RETRY_BACKOFF_MS),
      },
    });
  }
}
