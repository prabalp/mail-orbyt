import type { CampaignStatus, PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "campaign">;

export interface CreateCampaignParams {
  organisationId: string;
  name: string;
  description?: string;
  timezone?: string;
  sendingDaysOfWeek?: number[];
  sendingWindowStartMinute?: number;
  sendingWindowEndMinute?: number;
  createdByUserId: string;
}

export async function createCampaign(prisma: Prisma, params: CreateCampaignParams) {
  return prisma.campaign.create({
    data: {
      organisationId: params.organisationId,
      name: params.name,
      description: params.description,
      timezone: params.timezone,
      sendingDaysOfWeek: params.sendingDaysOfWeek,
      sendingWindowStartMinute: params.sendingWindowStartMinute,
      sendingWindowEndMinute: params.sendingWindowEndMinute,
      createdByUserId: params.createdByUserId,
    },
  });
}

export async function listCampaigns(prisma: Prisma, organisationId: string) {
  return prisma.campaign.findMany({
    where: { organisationId, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
  });
}

type CampaignDetailPrisma = Pick<PrismaClient, "campaign">;

export async function getCampaign(
  prisma: CampaignDetailPrisma,
  organisationId: string,
  campaignId: string,
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      steps: { orderBy: { orderIndex: "asc" } },
      inboxes: { include: { inbox: true } },
      enrollments: { select: { status: true } },
    },
  });
  if (!campaign || campaign.organisationId !== organisationId) return null;
  return campaign;
}

export interface UpdateCampaignParams {
  name?: string;
  description?: string;
  timezone?: string;
  sendingDaysOfWeek?: number[];
  sendingWindowStartMinute?: number;
  sendingWindowEndMinute?: number;
  status?: CampaignStatus;
}

export class CampaignActivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignActivationError";
  }
}

async function assertOwnedCampaign(prisma: Prisma, organisationId: string, campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organisationId !== organisationId) return null;
  return campaign;
}

export async function updateCampaign(
  prisma: Pick<PrismaClient, "campaign" | "campaignStep" | "campaignInbox">,
  organisationId: string,
  campaignId: string,
  patch: UpdateCampaignParams,
) {
  const campaign = await assertOwnedCampaign(prisma, organisationId, campaignId);
  if (!campaign) return null;

  if (patch.status === "ACTIVE") {
    const [stepCount, inboxCount] = await Promise.all([
      prisma.campaignStep.count({ where: { campaignId } }),
      prisma.campaignInbox.count({ where: { campaignId } }),
    ]);
    if (stepCount === 0) {
      throw new CampaignActivationError(
        "A campaign needs at least one step before it can go active.",
      );
    }
    if (inboxCount === 0) {
      throw new CampaignActivationError(
        "A campaign needs at least one connected inbox before it can go active.",
      );
    }
  }

  return prisma.campaign.update({ where: { id: campaignId }, data: patch });
}

export async function archiveCampaign(prisma: Prisma, organisationId: string, campaignId: string) {
  const campaign = await assertOwnedCampaign(prisma, organisationId, campaignId);
  if (!campaign) return null;
  return prisma.campaign.update({ where: { id: campaignId }, data: { status: "ARCHIVED" } });
}
