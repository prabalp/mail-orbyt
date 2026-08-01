import { prisma } from "@mail-orbyt/database";
import {
  createResearchJob,
  enqueueResearchJob,
  getLatestPageText,
  listFacts,
} from "@mail-orbyt/research";
import { enqueueResearchKeywordsJob } from "@mail-orbyt/research-keywords";
import { redisConnection } from "@/lib/queue";

export interface StartResearchParams {
  organisationId: string;
  subjectType: "LEAD" | "COMPANY";
  leadId?: string;
  companyId?: string;
  requestedByUserId: string;
}

export async function startResearchJob(params: StartResearchParams) {
  const job = await createResearchJob(prisma, params);
  await enqueueResearchJob(redisConnection, { researchJobId: job.id });
  return job;
}

export async function getResearchState(params: {
  organisationId: string;
  subjectType: "LEAD" | "COMPANY";
  leadId?: string;
  companyId?: string;
}) {
  const [facts, latestJob] = await Promise.all([
    listFacts(prisma, params),
    prisma.researchJob.findFirst({
      where: {
        organisationId: params.organisationId,
        leadId: params.leadId,
        companyId: params.companyId,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { facts, latestJob };
}

interface SubjectParams {
  organisationId: string;
  leadId?: string;
  companyId?: string;
}

/**
 * The ResearchSource for this subject's website — the one keyword extraction
 * reads from. Queried directly off ResearchSource (one continuously-updated
 * row per subject+URL, not one per job) rather than via the latest
 * ResearchJob, so a failed *rerun* doesn't hide an already-fetched source
 * from a prior successful run.
 */
async function getLatestWebsiteSource(params: SubjectParams) {
  return prisma.researchSource.findFirst({
    where: {
      organisationId: params.organisationId,
      subjectType: params.leadId ? "LEAD" : "COMPANY",
      leadId: params.leadId,
      companyId: params.companyId,
    },
    orderBy: { fetchedAt: "desc" },
  });
}

export async function startKeywordExtractionJob(params: SubjectParams) {
  const source = await getLatestWebsiteSource(params);
  if (!source) return null;

  await enqueueResearchKeywordsJob(redisConnection, {
    researchSourceId: source.id,
    organisationId: params.organisationId,
  });
  return { researchSourceId: source.id };
}

export async function getKeywordExtractionState(params: SubjectParams) {
  const source = await getLatestWebsiteSource(params);
  if (!source) return { available: false, latestRun: null, pageText: null };

  const [latestRun, pageText] = await Promise.all([
    prisma.researchKeywordRun.findFirst({
      where: { researchSourceId: source.id },
      orderBy: { createdAt: "desc" },
    }),
    getLatestPageText(prisma, {
      organisationId: params.organisationId,
      subjectType: params.leadId ? "LEAD" : "COMPANY",
      leadId: params.leadId,
      companyId: params.companyId,
    }),
  ]);

  return { available: true, latestRun, pageText };
}
