import { recordAuditEvent } from "@mail-orbyt/authentication";
import type { PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "lead" | "auditEvent">;

/**
 * GDPR/CCPA "right to erasure". Relies entirely on the schema's cascade
 * deletes (every child table's leadId FK is onDelete: Cascade — research
 * facts, email drafts, campaign enrollments, outbox items, conversations,
 * meetings) rather than manually deleting each table, so there is exactly
 * one place a future model addition could silently forget to cascade: the
 * schema itself, not this function. Deletion is logged via the standard
 * audit trail (DATA_DELETED) since erasure requests need their own record
 * — the irony of "we deleted the record of what we deleted" is avoided by
 * the audit log being deliberately separate from the lead's own data.
 */
export async function deleteLeadData(
  prisma: Prisma,
  organisationId: string,
  leadId: string,
  deletedByUserId: string,
): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.organisationId !== organisationId) return false;

  await prisma.lead.delete({ where: { id: leadId } });

  await recordAuditEvent(prisma, {
    type: "DATA_DELETED",
    organisationId,
    userId: deletedByUserId,
    metadata: { leadId, reason: "erasure_request" },
  });

  return true;
}
