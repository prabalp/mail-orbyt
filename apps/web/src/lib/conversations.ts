import {
  getConversation,
  listConversations,
  listRetargetableLeads,
} from "@mail-orbyt/conversations";
import { prisma } from "@mail-orbyt/database";

export async function listOrganisationConversations(organisationId: string) {
  return listConversations(prisma, organisationId);
}

export async function getOrganisationConversation(organisationId: string, conversationId: string) {
  return getConversation(prisma, organisationId, conversationId);
}

export async function listOrganisationRetargetableLeads(
  organisationId: string,
  excludeCampaignId?: string,
) {
  return listRetargetableLeads(prisma, { organisationId, excludeCampaignId });
}
