import type { PrismaClient } from "@mail-orbyt/database";
import { nextSendableTime } from "./sending-window";

type Prisma = Pick<PrismaClient, "campaignEnrollment" | "campaignStep" | "outboxItem">;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a step becomes due, before the campaign's sending window is applied:
 * the step's delay measured from the previous send (or from enrolment for
 * the first step), floored at `now` so a long-overdue step goes out at the
 * next opportunity rather than being back-dated.
 */
function dueTime(anchor: Date, delayDays: number, now: Date): Date {
  const earliestDue = new Date(anchor.getTime() + delayDays * DAY_MS);
  return earliestDue.getTime() > now.getTime() ? earliestDue : now;
}

/**
 * Ensures the next due OutboxItem exists for an enrollment's current step —
 * or marks the enrollment COMPLETED if there is no next step. Idempotent:
 * checks for an existing OutboxItem for (campaignId, leadId, stepId) before
 * creating one, so calling this repeatedly (every scheduler tick, for
 * every PENDING/ACTIVE enrollment) never creates a duplicate send.
 */
export async function scheduleNextStepForEnrollment(prisma: Prisma, enrollmentId: string) {
  const enrollment = await prisma.campaignEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { campaign: true },
  });
  if (!enrollment) return null;
  if (enrollment.status !== "PENDING" && enrollment.status !== "ACTIVE") return null;

  const step = await prisma.campaignStep.findUnique({
    where: {
      campaignId_orderIndex: {
        campaignId: enrollment.campaignId,
        orderIndex: enrollment.currentStepIndex,
      },
    },
  });

  if (!step) {
    await prisma.campaignEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "COMPLETED" },
    });
    return null;
  }

  const existing = await prisma.outboxItem.findUnique({
    where: {
      campaignId_leadId_campaignStepId: {
        campaignId: enrollment.campaignId,
        leadId: enrollment.leadId,
        campaignStepId: step.id,
      },
    },
  });
  if (existing) return existing;

  const anchor = enrollment.lastStepSentAt ?? enrollment.enrolledAt;
  const scheduledFor = nextSendableTime(
    enrollment.campaign,
    dueTime(anchor, step.delayDays, new Date()),
  );

  return prisma.outboxItem.create({
    data: {
      organisationId: enrollment.campaign.organisationId,
      campaignId: enrollment.campaignId,
      leadId: enrollment.leadId,
      campaignStepId: step.id,
      enrollmentId: enrollment.id,
      scheduledFor,
    },
  });
}

type ReschedulePrisma = Pick<PrismaClient, "campaign" | "outboxItem">;

/**
 * Recomputes `scheduledFor` on a campaign's not-yet-sent OutboxItems against
 * the campaign's CURRENT sending window. An item's send time is baked in at
 * creation, so without this a window/timezone edit only affects items created
 * afterwards — items already scheduled stay pinned to the old window, which
 * reads as "the campaign stopped sending" (they sit SCHEDULED, untouched,
 * until the old slot comes round).
 *
 * Step delays are re-derived from the enrollment anchor rather than preserved
 * from the old timestamp, so widening a window can never pull a follow-up in
 * ahead of its delayDays gap.
 */
export async function rescheduleCampaignOutboxItems(
  prisma: ReschedulePrisma,
  campaignId: string,
  now: Date = new Date(),
): Promise<number> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return 0;

  const items = await prisma.outboxItem.findMany({
    where: { campaignId, status: "SCHEDULED" },
    include: { enrollment: true, campaignStep: true },
  });

  // Every new time is computed before any is written: nextSendableTime throws
  // on a window that can never open (empty sending days, start >= end), and a
  // half-rescheduled campaign is worse than one that rejects the edit outright.
  const updates = items.flatMap((item) => {
    const anchor = item.enrollment.lastStepSentAt ?? item.enrollment.enrolledAt;
    const scheduledFor = nextSendableTime(
      campaign,
      dueTime(anchor, item.campaignStep.delayDays, now),
    );
    return scheduledFor.getTime() === item.scheduledFor.getTime()
      ? []
      : [{ id: item.id, scheduledFor }];
  });

  for (const update of updates) {
    await prisma.outboxItem.update({
      where: { id: update.id },
      data: { scheduledFor: update.scheduledFor },
    });
  }

  return updates.length;
}
