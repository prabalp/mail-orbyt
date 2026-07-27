import {
  createMeeting,
  getCampaignMetricsBreakdown,
  getQualifiedMeetingRate,
  getReplyRate,
  listMeetings,
  updateMeeting,
  type CreateMeetingParams,
  type UpdateMeetingParams,
} from "@mail-orbyt/analytics";
import { prisma } from "@mail-orbyt/database";

export async function createOrganisationMeeting(params: CreateMeetingParams) {
  return createMeeting(prisma, params);
}

export async function listOrganisationMeetings(organisationId: string) {
  return listMeetings(prisma, organisationId);
}

export async function updateOrganisationMeeting(
  organisationId: string,
  meetingId: string,
  patch: UpdateMeetingParams,
) {
  return updateMeeting(prisma, organisationId, meetingId, patch);
}

export async function getOrganisationAnalytics(organisationId: string) {
  const [overall, replyRate, campaigns] = await Promise.all([
    getQualifiedMeetingRate(prisma, { organisationId }),
    getReplyRate(prisma, { organisationId }),
    getCampaignMetricsBreakdown(prisma, organisationId),
  ]);
  return { overall, replyRate, campaigns };
}
