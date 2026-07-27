import type { PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "outboxItem" | "meeting" | "conversationMessage" | "campaign">;

export interface MetricsFilter {
  organisationId: string;
  campaignId?: string;
  since?: Date;
  until?: Date;
}

async function distinctSentLeadIds(prisma: Prisma, filter: MetricsFilter): Promise<string[]> {
  const rows = await prisma.outboxItem.findMany({
    where: {
      organisationId: filter.organisationId,
      status: "SENT",
      ...(filter.campaignId ? { campaignId: filter.campaignId } : {}),
      ...(filter.since || filter.until ? { sentAt: { gte: filter.since, lte: filter.until } } : {}),
    },
    distinct: ["leadId"],
    select: { leadId: true },
  });
  return rows.map((row) => row.leadId);
}

/** The denominator of the product's primary metric — every unique lead who was actually sent at least one email. */
export async function getUniqueProspectsContacted(
  prisma: Prisma,
  filter: MetricsFilter,
): Promise<number> {
  return (await distinctSentLeadIds(prisma, filter)).length;
}

/** The numerator — a meeting only counts if a human marked it `qualified`, and it hasn't been cancelled. */
export async function getQualifiedMeetingsBooked(
  prisma: Prisma,
  filter: MetricsFilter,
): Promise<number> {
  return prisma.meeting.count({
    where: {
      organisationId: filter.organisationId,
      qualified: true,
      status: { not: "CANCELLED" },
      ...(filter.campaignId ? { campaignId: filter.campaignId } : {}),
      ...(filter.since || filter.until
        ? { bookedAt: { gte: filter.since, lte: filter.until } }
        : {}),
    },
  });
}

export interface QualifiedMeetingRateResult {
  uniqueProspectsContacted: number;
  qualifiedMeetingsBooked: number;
  /** null when uniqueProspectsContacted is 0 — an undefined rate, not zero, since there's no denominator to divide by. */
  rate: number | null;
}

/**
 * The product's PRIMARY success metric: qualified meetings booked / unique
 * prospects contacted. Deliberately NOT open rate, click rate, or reply
 * rate — those are available as secondary context (see getReplyRate) but
 * must never be presented as the headline number, since they're easy to
 * game and don't reflect real pipeline generated.
 */
export async function getQualifiedMeetingRate(
  prisma: Prisma,
  filter: MetricsFilter,
): Promise<QualifiedMeetingRateResult> {
  const [uniqueProspectsContacted, qualifiedMeetingsBooked] = await Promise.all([
    getUniqueProspectsContacted(prisma, filter),
    getQualifiedMeetingsBooked(prisma, filter),
  ]);

  return {
    uniqueProspectsContacted,
    qualifiedMeetingsBooked,
    rate:
      uniqueProspectsContacted === 0 ? null : qualifiedMeetingsBooked / uniqueProspectsContacted,
  };
}

/** Secondary/contextual metric only — never the headline. Reply rate among contacted prospects, regardless of reply classification. */
export async function getReplyRate(prisma: Prisma, filter: MetricsFilter): Promise<number | null> {
  const contactedLeadIds = await distinctSentLeadIds(prisma, filter);
  if (contactedLeadIds.length === 0) return null;

  const repliedRows = await prisma.conversationMessage.findMany({
    where: {
      direction: "INBOUND",
      conversation: {
        organisationId: filter.organisationId,
        leadId: { in: contactedLeadIds },
      },
    },
    distinct: ["conversationId"],
    select: { conversationId: true },
  });

  return repliedRows.length / contactedLeadIds.length;
}

export interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  uniqueProspectsContacted: number;
  qualifiedMeetingsBooked: number;
  rate: number | null;
}

export async function getCampaignMetricsBreakdown(
  prisma: Prisma,
  organisationId: string,
): Promise<CampaignMetrics[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { organisationId },
    select: { id: true, name: true },
  });

  return Promise.all(
    campaigns.map(async (campaign) => {
      const result = await getQualifiedMeetingRate(prisma, {
        organisationId,
        campaignId: campaign.id,
      });
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        uniqueProspectsContacted: result.uniqueProspectsContacted,
        qualifiedMeetingsBooked: result.qualifiedMeetingsBooked,
        rate: result.rate,
      };
    }),
  );
}
