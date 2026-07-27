import type { PrismaClient } from "@mail-orbyt/database";
import { nextSendableTime } from "./sending-window";

type Prisma = Pick<PrismaClient, "campaignEnrollment" | "campaignStep" | "outboxItem">;

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const earliestDue = new Date(anchor.getTime() + step.delayDays * DAY_MS);
  const now = new Date();
  const baseTime = earliestDue.getTime() > now.getTime() ? earliestDue : now;
  const scheduledFor = nextSendableTime(enrollment.campaign, baseTime);

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
