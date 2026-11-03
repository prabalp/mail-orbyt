import type { PrismaClient } from "@mail-orbyt/database";
import { normalizeExclusionEmail as normalizeEmail } from "@mail-orbyt/scheduling";

type Prisma = Pick<
  PrismaClient,
  "campaign" | "campaignExclusion" | "campaignEnrollment" | "outboxItem" | "lead"
>;

export interface CampaignExclusionSummary {
  id: string;
  email: string;
  note: string | null;
  createdAt: Date;
}

async function assertCampaign(prisma: Prisma, organisationId: string, campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organisationId !== organisationId) {
    throw new Error("Campaign not found in this organisation.");
  }
}

export async function listCampaignExclusions(
  prisma: Prisma,
  organisationId: string,
  campaignId: string,
): Promise<CampaignExclusionSummary[]> {
  await assertCampaign(prisma, organisationId, campaignId);
  return prisma.campaignExclusion.findMany({
    where: { campaignId, organisationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, note: true, createdAt: true },
  });
}

/**
 * Adds addresses to the campaign's no-contact list and stops any pending
 * outreach to them right away: their open enrollments become SUPPRESSED and
 * their still-scheduled emails are cancelled. The send-time check in
 * processOutboxItem remains the safety net for anything this misses.
 */
export async function addCampaignExclusions(
  prisma: Prisma,
  params: { organisationId: string; campaignId: string; emails: string[]; note?: string },
): Promise<{ added: number; alreadyListed: number; enrollmentsStopped: number }> {
  await assertCampaign(prisma, params.organisationId, params.campaignId);
  const emails = [...new Set(params.emails.map(normalizeEmail).filter(Boolean))];

  const existing = await prisma.campaignExclusion.findMany({
    where: { campaignId: params.campaignId, email: { in: emails } },
    select: { email: true },
  });
  const alreadyListed = new Set(existing.map((entry) => entry.email));
  const fresh = emails.filter((email) => !alreadyListed.has(email));

  if (fresh.length > 0) {
    await prisma.campaignExclusion.createMany({
      data: fresh.map((email) => ({
        campaignId: params.campaignId,
        organisationId: params.organisationId,
        email,
        note: params.note,
      })),
      skipDuplicates: true,
    });
  }

  const leads = await prisma.lead.findMany({
    where: {
      organisationId: params.organisationId,
      email: { in: emails, mode: "insensitive" },
    },
    select: { id: true },
  });
  const leadIds = leads.map((lead) => lead.id);
  if (leadIds.length === 0) {
    return { added: fresh.length, alreadyListed: alreadyListed.size, enrollmentsStopped: 0 };
  }

  await prisma.outboxItem.updateMany({
    where: {
      campaignId: params.campaignId,
      leadId: { in: leadIds },
      status: "SCHEDULED",
    },
    data: { status: "CANCELLED" },
  });
  const stopped = await prisma.campaignEnrollment.updateMany({
    where: {
      campaignId: params.campaignId,
      leadId: { in: leadIds },
      status: { in: ["PENDING", "ACTIVE", "PAUSED"] },
    },
    data: {
      status: "SUPPRESSED",
      exitedAt: new Date(),
      exitReason: "On campaign no-contact list",
    },
  });

  return {
    added: fresh.length,
    alreadyListed: alreadyListed.size,
    enrollmentsStopped: stopped.count,
  };
}

export async function removeCampaignExclusion(
  prisma: Prisma,
  params: { organisationId: string; campaignId: string; email: string },
): Promise<boolean> {
  await assertCampaign(prisma, params.organisationId, params.campaignId);
  const { count } = await prisma.campaignExclusion.deleteMany({
    where: {
      campaignId: params.campaignId,
      organisationId: params.organisationId,
      email: normalizeEmail(params.email),
    },
  });
  return count > 0;
}
