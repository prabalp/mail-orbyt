import { recordAuditEvent } from "@mail-orbyt/authentication";
import type { PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<
  PrismaClient,
  | "lead"
  | "researchFact"
  | "emailDraft"
  | "campaignEnrollment"
  | "conversation"
  | "meeting"
  | "auditEvent"
>;

/**
 * GDPR/CCPA "right to access" — every piece of data the product holds
 * about one lead, gathered into a single exportable bundle. Deliberately
 * flat and complete rather than paginated or summarized: a data subject
 * access request wants everything, not a preview.
 */
export async function exportLeadData(
  prisma: Prisma,
  organisationId: string,
  leadId: string,
  requestedByUserId?: string,
) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { company: true } });
  if (!lead || lead.organisationId !== organisationId) return null;

  const [researchFacts, emailDrafts, campaignEnrollments, conversations, meetings] =
    await Promise.all([
      prisma.researchFact.findMany({ where: { leadId } }),
      prisma.emailDraft.findMany({ where: { leadId } }),
      prisma.campaignEnrollment.findMany({ where: { leadId }, include: { campaign: true } }),
      prisma.conversation.findMany({ where: { leadId }, include: { messages: true } }),
      prisma.meeting.findMany({ where: { leadId } }),
    ]);

  await recordAuditEvent(prisma, {
    type: "DATA_EXPORTED",
    organisationId,
    userId: requestedByUserId,
    metadata: { leadId },
  });

  return {
    lead,
    researchFacts,
    emailDrafts,
    campaignEnrollments,
    conversations,
    meetings,
    exportedAt: new Date(),
  };
}
