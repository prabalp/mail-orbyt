import type { PrismaClient, ResearchFactStatus, ResearchSubjectType } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "researchFact">;

export interface ListFactsParams {
  organisationId: string;
  subjectType: ResearchSubjectType;
  leadId?: string;
  companyId?: string;
  status?: ResearchFactStatus;
}

export async function listFacts(prisma: Prisma, params: ListFactsParams) {
  return prisma.researchFact.findMany({
    where: {
      organisationId: params.organisationId,
      subjectType: params.subjectType,
      leadId: params.leadId,
      companyId: params.companyId,
      status: params.status,
    },
    orderBy: [{ category: "asc" }, { confidence: "desc" }],
  });
}

async function getOwnedFact(prisma: Prisma, organisationId: string, factId: string) {
  const fact = await prisma.researchFact.findUnique({ where: { id: factId } });
  if (!fact || fact.organisationId !== organisationId) return null;
  return fact;
}

export async function confirmFact(prisma: Prisma, organisationId: string, factId: string) {
  const fact = await getOwnedFact(prisma, organisationId, factId);
  if (!fact) return null;
  return prisma.researchFact.update({ where: { id: factId }, data: { status: "USER_CONFIRMED" } });
}

export async function rejectFact(prisma: Prisma, organisationId: string, factId: string) {
  const fact = await getOwnedFact(prisma, organisationId, factId);
  if (!fact) return null;
  return prisma.researchFact.update({ where: { id: factId }, data: { status: "USER_REJECTED" } });
}

/**
 * Editing a fact's value marks it CONFLICTED rather than silently
 * overwriting — the spec requires conflicting facts to never be silently
 * merged. A human editor reviewing the fact is expected to then explicitly
 * confirm it (moving it to USER_CONFIRMED) once satisfied.
 */
export async function editFact(
  prisma: Prisma,
  organisationId: string,
  factId: string,
  newValue: string,
) {
  const fact = await getOwnedFact(prisma, organisationId, factId);
  if (!fact) return null;
  return prisma.researchFact.update({
    where: { id: factId },
    data: { value: newValue, status: "CONFLICTED" },
  });
}
