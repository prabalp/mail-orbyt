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

/** How many lead IDs one bulk delete will touch per statement — large enough that a full-list purge is a handful of round trips, small enough to stay well inside Postgres's parameter limits. */
const DELETE_CHUNK_SIZE = 1000;

/**
 * Bulk counterpart to deleteLeadData, for the leads table's "select all →
 * delete" action. Same cascade semantics (everything tied to each lead goes
 * with it — outbox items, conversations, meetings, research), and the
 * deleteMany is scoped by organisationId as well as ID so a caller passing a
 * foreign lead ID deletes nothing rather than someone else's data. One
 * audit event is recorded for the operation as a whole, carrying the count
 * and the IDs, rather than one event per lead.
 */
export async function deleteLeadsData(
  prisma: Prisma,
  organisationId: string,
  leadIds: string[],
  deletedByUserId: string,
): Promise<number> {
  if (leadIds.length === 0) return 0;

  let deleted = 0;
  for (let index = 0; index < leadIds.length; index += DELETE_CHUNK_SIZE) {
    const chunk = leadIds.slice(index, index + DELETE_CHUNK_SIZE);
    const result = await prisma.lead.deleteMany({
      where: { id: { in: chunk }, organisationId },
    });
    deleted += result.count;
  }

  await recordAuditEvent(prisma, {
    type: "DATA_DELETED",
    organisationId,
    userId: deletedByUserId,
    metadata: { leadIds, deletedCount: deleted, reason: "bulk_delete" },
  });

  return deleted;
}
