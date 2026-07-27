import type { PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "campaignEnrollment" | "lead">;

export interface ListRetargetableLeadsParams {
  organisationId: string;
  /** Exclude leads already enrolled (in any status) in this campaign — used when picking retargets to add to a specific new campaign. */
  excludeCampaignId?: string;
}

/**
 * Leads who finished a full sequence without ever replying (enrollment
 * COMPLETED) and aren't currently mid-sequence anywhere else — the
 * canonical retargeting pool. A lead who replied is never here: their
 * enrollment exits as EXITED (see reply-sync-service.ts), not COMPLETED.
 */
export async function listRetargetableLeads(prisma: Prisma, params: ListRetargetableLeadsParams) {
  const completed = await prisma.campaignEnrollment.findMany({
    where: { campaign: { organisationId: params.organisationId }, status: "COMPLETED" },
    select: { leadId: true },
    distinct: ["leadId"],
  });
  const candidateLeadIds = completed.map((enrollment) => enrollment.leadId);
  if (candidateLeadIds.length === 0) return [];

  const activeElsewhere = await prisma.campaignEnrollment.findMany({
    where: { leadId: { in: candidateLeadIds }, status: { in: ["PENDING", "ACTIVE"] } },
    select: { leadId: true },
  });
  const activeLeadIds = new Set(activeElsewhere.map((enrollment) => enrollment.leadId));

  let eligibleLeadIds = candidateLeadIds.filter((id) => !activeLeadIds.has(id));

  if (params.excludeCampaignId) {
    const alreadyInTarget = await prisma.campaignEnrollment.findMany({
      where: { campaignId: params.excludeCampaignId, leadId: { in: eligibleLeadIds } },
      select: { leadId: true },
    });
    const excludeIds = new Set(alreadyInTarget.map((enrollment) => enrollment.leadId));
    eligibleLeadIds = eligibleLeadIds.filter((id) => !excludeIds.has(id));
  }

  return prisma.lead.findMany({
    where: { id: { in: eligibleLeadIds }, organisationId: params.organisationId, status: "ACTIVE" },
  });
}
