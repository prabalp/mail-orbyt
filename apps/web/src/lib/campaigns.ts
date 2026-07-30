import {
  addStep,
  archiveCampaign,
  createCampaign,
  enrollLeads,
  enrollLeadsFromList,
  exitEnrollment,
  getCampaign,
  listCampaigns,
  listEnrollments,
  removeStep,
  reorderSteps,
  setCampaignInboxes,
  updateCampaign,
  updateStep,
  type AddStepParams,
  type CreateCampaignParams,
  type UpdateCampaignParams,
} from "@mail-orbyt/campaigns";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { getAiEmailGenerator, isAiConfigured } from "@mail-orbyt/email-generation";
import { sendFromInbox } from "@mail-orbyt/gmail";
import { enqueueDueOutboxItems, processOutboxItem } from "@mail-orbyt/scheduling";

export {
  CampaignActivationError,
  InvalidStepError,
  InvalidInboxPoolError,
} from "@mail-orbyt/campaigns";

export async function createOrganisationCampaign(params: CreateCampaignParams) {
  return createCampaign(prisma, params);
}

export async function listOrganisationCampaigns(organisationId: string) {
  return listCampaigns(prisma, organisationId);
}

export async function getOrganisationCampaign(organisationId: string, campaignId: string) {
  return getCampaign(prisma, organisationId, campaignId);
}

export async function updateOrganisationCampaign(
  organisationId: string,
  campaignId: string,
  patch: UpdateCampaignParams,
) {
  return updateCampaign(prisma, organisationId, campaignId, patch);
}

export async function archiveOrganisationCampaign(organisationId: string, campaignId: string) {
  return archiveCampaign(prisma, organisationId, campaignId);
}

export async function addCampaignStep(
  organisationId: string,
  campaignId: string,
  params: AddStepParams,
) {
  return addStep(prisma, organisationId, campaignId, params);
}

export async function updateCampaignStep(
  organisationId: string,
  campaignId: string,
  stepId: string,
  patch: Partial<AddStepParams>,
) {
  return updateStep(prisma, organisationId, campaignId, stepId, patch);
}

export async function removeCampaignStep(
  organisationId: string,
  campaignId: string,
  stepId: string,
) {
  return removeStep(prisma, organisationId, campaignId, stepId);
}

export async function reorderCampaignSteps(
  organisationId: string,
  campaignId: string,
  orderedStepIds: string[],
) {
  return reorderSteps(prisma, organisationId, campaignId, orderedStepIds);
}

export async function setCampaignInboxPool(
  organisationId: string,
  campaignId: string,
  inboxIds: string[],
) {
  return setCampaignInboxes(prisma, organisationId, campaignId, inboxIds);
}

export async function enrollCampaignLeads(
  organisationId: string,
  campaignId: string,
  leadIds: string[],
) {
  return enrollLeads(prisma, organisationId, campaignId, leadIds);
}

export async function enrollCampaignLeadsFromList(
  organisationId: string,
  campaignId: string,
  leadListId: string,
) {
  return enrollLeadsFromList(prisma, organisationId, campaignId, leadListId);
}

export async function listCampaignEnrollments(organisationId: string, campaignId: string) {
  return listEnrollments(prisma, organisationId, campaignId);
}

export async function exitCampaignEnrollment(
  organisationId: string,
  campaignId: string,
  leadId: string,
  reason?: string,
) {
  return exitEnrollment(prisma, organisationId, campaignId, leadId, reason);
}

async function getSenderContext(organisationId: string) {
  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisationId },
  });
  return { senderName: organisation.name, senderCompanyName: organisation.name };
}

/**
 * Dev-only test helper: sends this campaign's due outbox items right now,
 * synchronously, bypassing the 60s scheduler tick and BullMQ entirely. Mirrors
 * the deps wiring in apps/worker/src/queues/outbox.ts so behavior matches
 * production sending. Never call this in production — see the NODE_ENV
 * guard in the send-now route.
 */
export async function sendCampaignNow(organisationId: string, campaignId: string) {
  const env = loadEnv();

  await enqueueDueOutboxItems(prisma);

  const dueItems = await prisma.outboxItem.findMany({
    where: { campaignId, organisationId, status: "SCHEDULED" },
    select: { id: true, enrollmentId: true },
  });

  const results = [];
  for (const item of dueItems) {
    const processed = await processOutboxItem(
      prisma,
      {
        aiGenerator: isAiConfigured() ? getAiEmailGenerator() : undefined,
        sendEmail: (inboxId, message) => sendFromInbox(prisma, inboxId, message),
        getSenderContext,
        emergencyStop: env.EMERGENCY_STOP,
      },
      item.id,
    );
    results.push(processed);
  }

  return {
    considered: dueItems.length,
    sent: results.filter((r) => r?.status === "SENT").length,
    failed: results.filter((r) => r?.status === "FAILED").length,
    skipped: results.filter((r) => r?.status?.startsWith("SKIPPED")).length,
  };
}
