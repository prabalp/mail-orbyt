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
import { prisma } from "@mail-orbyt/database";

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
