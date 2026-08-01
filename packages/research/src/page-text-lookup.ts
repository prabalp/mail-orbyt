import type { PrismaClient, ResearchSubjectType } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "researchSource" | "researchPageText">;

export interface GetLatestPageTextParams {
  organisationId: string;
  subjectType: ResearchSubjectType;
  leadId?: string;
  companyId?: string;
}

export interface LatestPageText {
  text: string;
  charCount: number;
  url: string;
}

/**
 * The saved page text for a subject's most recently fetched website source
 * (one continuously-updated ResearchSource row per subject+URL — see
 * findOrCreateResearchSource in research-job-service.ts — not one per job).
 * Shared by keyword extraction and email generation, both of which need the
 * same "what did we last fetch for this lead/company" lookup.
 */
export async function getLatestPageText(
  prisma: Prisma,
  params: GetLatestPageTextParams,
): Promise<LatestPageText | null> {
  const source = await prisma.researchSource.findFirst({
    where: {
      organisationId: params.organisationId,
      subjectType: params.subjectType,
      leadId: params.leadId,
      companyId: params.companyId,
    },
    orderBy: { fetchedAt: "desc" },
    include: { pageText: true },
  });
  if (!source?.pageText) return null;

  return { text: source.pageText.text, charCount: source.pageText.charCount, url: source.url };
}
