import type { MeetingStatus, PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "meeting" | "lead">;

export interface CreateMeetingParams {
  organisationId: string;
  leadId: string;
  campaignId?: string;
  conversationId?: string;
  scheduledFor?: Date;
  notes?: string;
  createdByUserId: string;
}

export async function createMeeting(prisma: Prisma, params: CreateMeetingParams) {
  const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });
  if (!lead || lead.organisationId !== params.organisationId) {
    throw new Error("Lead does not belong to this organisation.");
  }

  return prisma.meeting.create({
    data: {
      organisationId: params.organisationId,
      leadId: params.leadId,
      campaignId: params.campaignId,
      conversationId: params.conversationId,
      scheduledFor: params.scheduledFor,
      notes: params.notes,
      createdByUserId: params.createdByUserId,
    },
  });
}

export async function listMeetings(prisma: Prisma, organisationId: string) {
  return prisma.meeting.findMany({
    where: { organisationId },
    include: { lead: true },
    orderBy: { bookedAt: "desc" },
  });
}

export interface UpdateMeetingParams {
  status?: MeetingStatus;
  qualified?: boolean;
  notes?: string;
  scheduledFor?: Date;
}

export async function updateMeeting(
  prisma: Prisma,
  organisationId: string,
  meetingId: string,
  patch: UpdateMeetingParams,
) {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting || meeting.organisationId !== organisationId) return null;
  return prisma.meeting.update({ where: { id: meetingId }, data: patch });
}
