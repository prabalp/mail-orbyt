import { isSuppressed } from "@mail-orbyt/leads";
import type { PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<
  PrismaClient,
  | "campaign"
  | "lead"
  | "campaignEnrollment"
  | "suppressionEntry"
  | "leadListMembership"
  | "auditEvent"
>;

export interface EnrollLeadsResult {
  enrolled: number;
  alreadyEnrolled: number;
  suppressed: number;
}

/** Enrolls leads into a campaign. A lead already suppressed at enrollment time is enrolled with status SUPPRESSED (visible, auditable) rather than silently dropped — Phase 8's send path re-checks suppression anyway, but the builder should never hide that a contact is unreachable. */
export async function enrollLeads(
  prisma: Prisma,
  organisationId: string,
  campaignId: string,
  leadIds: string[],
): Promise<EnrollLeadsResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organisationId !== organisationId) {
    throw new Error("Campaign not found in this organisation.");
  }

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds }, organisationId },
  });

  const existing = await prisma.campaignEnrollment.findMany({
    where: { campaignId, leadId: { in: leads.map((lead) => lead.id) } },
    select: { leadId: true },
  });
  const alreadyEnrolledIds = new Set(existing.map((e) => e.leadId));

  const result: EnrollLeadsResult = { enrolled: 0, alreadyEnrolled: 0, suppressed: 0 };

  for (const lead of leads) {
    if (alreadyEnrolledIds.has(lead.id)) {
      result.alreadyEnrolled += 1;
      continue;
    }

    const suppressed = lead.email ? await isSuppressed(prisma, organisationId, lead.email) : false;
    await prisma.campaignEnrollment.create({
      data: { campaignId, leadId: lead.id, status: suppressed ? "SUPPRESSED" : "PENDING" },
    });

    if (suppressed) result.suppressed += 1;
    else result.enrolled += 1;
  }

  return result;
}

export async function enrollLeadsFromList(
  prisma: Prisma,
  organisationId: string,
  campaignId: string,
  leadListId: string,
): Promise<EnrollLeadsResult> {
  const memberships = await prisma.leadListMembership.findMany({
    where: { leadListId },
    select: { leadId: true },
  });
  return enrollLeads(
    prisma,
    organisationId,
    campaignId,
    memberships.map((m) => m.leadId),
  );
}

export async function listEnrollments(
  prisma: Pick<PrismaClient, "campaign" | "campaignEnrollment">,
  organisationId: string,
  campaignId: string,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organisationId !== organisationId) return null;

  return prisma.campaignEnrollment.findMany({
    where: { campaignId },
    include: { lead: true },
    orderBy: { enrolledAt: "desc" },
  });
}

export async function exitEnrollment(
  prisma: Pick<PrismaClient, "campaign" | "campaignEnrollment">,
  organisationId: string,
  campaignId: string,
  leadId: string,
  reason?: string,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organisationId !== organisationId) return null;

  const enrollment = await prisma.campaignEnrollment.findUnique({
    where: { campaignId_leadId: { campaignId, leadId } },
  });
  if (!enrollment) return null;

  return prisma.campaignEnrollment.update({
    where: { id: enrollment.id },
    data: { status: "EXITED", exitedAt: new Date(), exitReason: reason },
  });
}
