import type { LeadList, PrismaClient } from "@mail-orbyt/database";

type LeadListsPrisma = Pick<PrismaClient, "leadList" | "leadListMembership">;

export interface LeadListSummary extends LeadList {
  leadCount: number;
}

/**
 * Lists an organisation's lead lists with their membership counts. Counts are
 * fetched in one groupBy rather than a per-list count so the campaign
 * enrollment picker stays a single round trip regardless of list count.
 */
export async function listLeadLists(
  prisma: LeadListsPrisma,
  organisationId: string,
): Promise<LeadListSummary[]> {
  const lists = await prisma.leadList.findMany({
    where: { organisationId },
    orderBy: { createdAt: "desc" },
  });
  if (lists.length === 0) return [];

  const counts = await prisma.leadListMembership.groupBy({
    by: ["leadListId"],
    where: { leadListId: { in: lists.map((list) => list.id) } },
    _count: { _all: true },
  });
  const countByListId = new Map(counts.map((row) => [row.leadListId, row._count._all]));

  return lists.map((list) => ({ ...list, leadCount: countByListId.get(list.id) ?? 0 }));
}

/**
 * Resolves a list by name within an organisation, creating it if it doesn't
 * exist. Import naming is deliberately idempotent rather than erroring on a
 * repeat name — re-importing a refreshed CSV of the same audience should
 * extend that audience's list, not force the operator to invent "Q3 leads 2".
 */
export async function createOrGetLeadList(
  prisma: LeadListsPrisma,
  organisationId: string,
  name: string,
  description?: string,
): Promise<LeadList> {
  const trimmed = name.trim();
  const existing = await prisma.leadList.findUnique({
    where: { organisationId_name: { organisationId, name: trimmed } },
  });
  if (existing) return existing;

  return prisma.leadList.create({
    data: { organisationId, name: trimmed, description: description?.trim() || null },
  });
}

/**
 * Adds leads to a list, ignoring any that are already members. Uses
 * createMany + skipDuplicates against the (leadListId, leadId) unique
 * constraint so a re-run of an import job never fails on rows it already
 * added.
 */
export async function addLeadsToList(
  prisma: LeadListsPrisma,
  leadListId: string,
  leadIds: string[],
): Promise<number> {
  if (leadIds.length === 0) return 0;
  const result = await prisma.leadListMembership.createMany({
    data: leadIds.map((leadId) => ({ leadListId, leadId })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function deleteLeadList(
  prisma: LeadListsPrisma,
  organisationId: string,
  leadListId: string,
): Promise<boolean> {
  const list = await prisma.leadList.findUnique({ where: { id: leadListId } });
  if (!list || list.organisationId !== organisationId) return false;
  // Memberships cascade; the leads themselves are untouched.
  await prisma.leadList.delete({ where: { id: leadListId } });
  return true;
}
