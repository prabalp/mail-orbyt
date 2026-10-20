import { recordAuditEvent } from "@mail-orbyt/authentication";
import type { Campaign, CampaignStatus, PrismaClient } from "@mail-orbyt/database";
import { rescheduleCampaignOutboxItems } from "@mail-orbyt/scheduling";

type Prisma = Pick<PrismaClient, "campaign">;

export interface CreateCampaignParams {
  organisationId: string;
  name: string;
  description?: string;
  timezone?: string;
  sendingDaysOfWeek?: number[];
  sendingWindowStartMinute?: number;
  sendingWindowEndMinute?: number;
  inboxCooldownMinutes?: number;
  emailPromptInstructions?: string | null;
  /** JOURNEY campaigns follow each lead's own email graph instead of an ordered step list. */
  routingMode?: "LINEAR" | "JOURNEY";
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
      inboxCooldownMinutes: params.inboxCooldownMinutes,
      emailPromptInstructions: params.emailPromptInstructions,
      routingMode: params.routingMode,
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

type CampaignDetailPrisma = Pick<PrismaClient, "campaign" | "outboxItem">;

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

  // Surfaced so the schedule UI can show when the next email actually goes
  // out. A saved window on its own doesn't prove anything about queued sends
  // — their send times are stored per item, and only match the window if they
  // were rescheduled when it changed.
  const pending = await prisma.outboxItem.aggregate({
    where: { campaignId, status: "SCHEDULED" },
    _count: { _all: true },
    _min: { scheduledFor: true },
  });

  return {
    ...campaign,
    pendingSends: {
      count: pending._count._all,
      nextScheduledFor: pending._min.scheduledFor,
    },
  };
}

export interface UpdateCampaignParams {
  name?: string;
  description?: string;
  timezone?: string;
  sendingDaysOfWeek?: number[];
  sendingWindowStartMinute?: number;
  sendingWindowEndMinute?: number;
  inboxCooldownMinutes?: number;
  /** Campaign-level tone/style guidance; null clears it and falls back to the organisation's. */
  emailPromptInstructions?: string | null;
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

/**
 * Whether a patch actually moves the campaign's sending window — the fields
 * nextSendableTime reads. Compared against the stored values rather than
 * merely being present in the patch, since the UI submits the whole schedule
 * form on every save and a no-op resave should not churn send times.
 */
function movesSendingWindow(campaign: Campaign, patch: UpdateCampaignParams): boolean {
  if (patch.timezone !== undefined && patch.timezone !== campaign.timezone) return true;
  if (
    patch.sendingWindowStartMinute !== undefined &&
    patch.sendingWindowStartMinute !== campaign.sendingWindowStartMinute
  ) {
    return true;
  }
  if (
    patch.sendingWindowEndMinute !== undefined &&
    patch.sendingWindowEndMinute !== campaign.sendingWindowEndMinute
  ) {
    return true;
  }
  if (patch.sendingDaysOfWeek !== undefined) {
    const before = [...campaign.sendingDaysOfWeek].sort((a, b) => a - b);
    const after = [...patch.sendingDaysOfWeek].sort((a, b) => a - b);
    if (before.length !== after.length || before.some((day, i) => day !== after[i])) return true;
  }
  return false;
}

async function assertImportedEmailsCoverEnrollments(
  prisma: Pick<PrismaClient, "campaignStep" | "campaignEnrollment" | "leadImportedEmail">,
  campaignId: string,
) {
  const steps = await prisma.campaignStep.findMany({
    where: { campaignId, useImportedContent: true },
    select: { orderIndex: true },
  });
  if (steps.length === 0) return;
  const sequences = steps.map((step) => step.orderIndex + 1);
  const enrollments = await prisma.campaignEnrollment.findMany({
    where: { campaignId, status: { in: ["PENDING", "ACTIVE", "PAUSED"] } },
    select: { leadId: true, lead: { select: { email: true } } },
  });
  if (enrollments.length === 0) return;

  const imported = await prisma.leadImportedEmail.findMany({
    where: {
      leadId: { in: enrollments.map((enrollment) => enrollment.leadId) },
      sequence: { in: sequences },
    },
    select: { leadId: true, sequence: true },
  });
  const present = new Set(imported.map((email) => `${email.leadId}:${email.sequence}`));
  const missing = new Set<string>();
  for (const enrollment of enrollments) {
    for (const sequence of sequences) {
      if (!present.has(`${enrollment.leadId}:${sequence}`)) {
        missing.add(enrollment.lead.email ?? enrollment.leadId);
      }
    }
  }
  if (missing.size > 0) {
    const sample = [...missing].slice(0, 5).join(", ");
    throw new CampaignActivationError(
      `Imported-email steps are missing content for: ${sample}. Import those emails or switch the step back to AI generation.`,
    );
  }
}

export async function updateCampaign(
  prisma: Pick<
    PrismaClient,
    | "campaign"
    | "campaignStep"
    | "campaignInbox"
    | "outboxItem"
    | "campaignEnrollment"
    | "leadImportedEmail"
    | "auditEvent"
  >,
  organisationId: string,
  campaignId: string,
  patch: UpdateCampaignParams,
  actor?: { userId?: string },
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
    await assertImportedEmailsCoverEnrollments(prisma, campaignId);
  }

  // Resuming re-anchors pending sends for the same reason a window edit does:
  // an item's scheduledFor is computed once, at creation, so anything the pause
  // left pointing at a stale slot (a send deferred an hour for want of a free
  // inbox, a time clamped into a window that has since passed) would keep that
  // time and make the resumed campaign look inert. Re-deriving from the
  // enrollment anchor puts overdue items at `now` without ever pulling a
  // follow-up in ahead of its delayDays gap.
  const resuming = patch.status === "ACTIVE" && campaign.status === "PAUSED";
  const shouldReschedule = movesSendingWindow(campaign, patch) || resuming;
  const previousStatus = campaign.status;
  const updated = await prisma.campaign.update({ where: { id: campaignId }, data: patch });

  if (patch.status === "ACTIVE" && previousStatus !== "ACTIVE") {
    await recordAuditEvent(prisma, {
      type: "CAMPAIGN_LAUNCHED",
      organisationId,
      userId: actor?.userId,
      metadata: { campaignId, previousStatus },
    });
  } else if (patch.status === "PAUSED" && previousStatus !== "PAUSED") {
    await recordAuditEvent(prisma, {
      type: "CAMPAIGN_PAUSED",
      organisationId,
      userId: actor?.userId,
      metadata: { campaignId, previousStatus },
    });
  }

  // Pending sends carry a scheduledFor computed under the OLD window, so
  // without this the edit silently applies to future items only.
  if (shouldReschedule) {
    await rescheduleCampaignOutboxItems(prisma, campaignId);
  }

  return updated;
}

export async function archiveCampaign(prisma: Prisma, organisationId: string, campaignId: string) {
  const campaign = await assertOwnedCampaign(prisma, organisationId, campaignId);
  if (!campaign) return null;
  return prisma.campaign.update({ where: { id: campaignId }, data: { status: "ARCHIVED" } });
}
