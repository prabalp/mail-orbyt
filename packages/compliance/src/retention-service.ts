import type { PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "emailDraft" | "importRow">;

export interface RetentionPurgeResult {
  discardedDraftsDeleted: number;
  importRowsDeleted: number;
}

/**
 * Deletes data past its useful life, scoped to one organisation. This is
 * deliberately narrow: suppression entries are NEVER purged here (a "do
 * not contact" record must persist indefinitely — losing one and
 * re-emailing someone who opted out is a real compliance failure), and
 * sent OutboxItems/Meetings are never purged either (send/meeting history
 * is business record, not transient data). What IS purged:
 * - DISCARDED EmailDraft rows — rejected AI drafts serve no purpose once discarded.
 * - ImportRow rows older than the retention window — raw per-row CSV data
 *   (including whatever the source file contained) has already been
 *   normalized into Lead rows; keeping it indefinitely is unnecessary PII
 *   retention.
 */
export async function purgeStaleData(
  prisma: Prisma,
  organisationId: string,
  retentionDays: number,
): Promise<RetentionPurgeResult> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const [discardedDrafts, importRows] = await Promise.all([
    prisma.emailDraft.deleteMany({
      where: { organisationId, status: "DISCARDED", updatedAt: { lt: cutoff } },
    }),
    prisma.importRow.deleteMany({
      where: { importBatch: { organisationId }, createdAt: { lt: cutoff } },
    }),
  ]);

  return {
    discardedDraftsDeleted: discardedDrafts.count,
    importRowsDeleted: importRows.count,
  };
}
