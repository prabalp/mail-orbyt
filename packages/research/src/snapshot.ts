import type {
  Prisma as PrismaTypes,
  PrismaClient,
  ResearchSubjectType,
} from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "researchFact" | "researchSnapshot">;

export interface CreateResearchSnapshotParams {
  organisationId: string;
  subjectType: ResearchSubjectType;
  leadId?: string;
  companyId?: string;
}

export interface SnapshotFact {
  factId: string;
  category: string;
  value: string;
  sourceUrl: string;
}

/**
 * Snapshots a subject's currently-eligible facts (OBSERVED or
 * USER_CONFIRMED only — never USER_REJECTED, EXPIRED, or CONFLICTED, since a
 * conflicted fact's value is disputed and shouldn't be fed to email
 * generation until a human resolves it) into an immutable ResearchSnapshot
 * row. Phase 5's email generation reads from a snapshot rather than live
 * facts, so a draft's inputs stay reproducible even if the underlying facts
 * are later edited, confirmed, or rejected.
 */
export async function createResearchSnapshot(prisma: Prisma, params: CreateResearchSnapshotParams) {
  const facts = await prisma.researchFact.findMany({
    where: {
      organisationId: params.organisationId,
      subjectType: params.subjectType,
      leadId: params.leadId,
      companyId: params.companyId,
      status: { in: ["OBSERVED", "USER_CONFIRMED"] },
    },
    orderBy: [{ category: "asc" }, { confidence: "desc" }],
  });

  const snapshotFacts: SnapshotFact[] = facts.map((fact) => ({
    factId: fact.id,
    category: fact.category,
    value: fact.value,
    sourceUrl: fact.sourceUrl,
  }));

  return prisma.researchSnapshot.create({
    data: {
      organisationId: params.organisationId,
      subjectType: params.subjectType,
      leadId: params.leadId,
      companyId: params.companyId,
      facts: snapshotFacts as unknown as PrismaTypes.InputJsonValue,
    },
  });
}
