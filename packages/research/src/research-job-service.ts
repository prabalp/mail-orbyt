import type { PrismaClient, ResearchSubjectType } from "@mail-orbyt/database";
import { assertAllowedCategory } from "./categories";
import { extractJsonLd } from "./extraction/json-ld";
import { extractMetaTags, extractOpenGraph } from "./extraction/open-graph";
import {
  factsFromJsonLdNodes,
  factsFromMetaTags,
  factsFromOpenGraph,
  type FactCandidate,
} from "./facts-from-document";
import type { EnrichmentProvider, NewsProvider, SearchProvider } from "./providers";
import { fetchWebsite, WebsiteFetchError } from "./website-fetcher";
import { UnsafeUrlError } from "./ssrf-guard";

type Prisma = Pick<
  PrismaClient,
  | "researchJob"
  | "researchProviderRun"
  | "researchSource"
  | "researchDocument"
  | "researchFact"
  | "lead"
  | "company"
>;

export interface CreateResearchJobParams {
  organisationId: string;
  subjectType: ResearchSubjectType;
  leadId?: string;
  companyId?: string;
  requestedByUserId?: string;
}

export async function createResearchJob(
  prisma: Pick<PrismaClient, "researchJob">,
  params: CreateResearchJobParams,
) {
  return prisma.researchJob.create({
    data: {
      organisationId: params.organisationId,
      subjectType: params.subjectType,
      leadId: params.leadId,
      companyId: params.companyId,
      requestedByUserId: params.requestedByUserId,
    },
  });
}

export interface ResearchProviders {
  search: SearchProvider;
  news: NewsProvider;
  enrichment: EnrichmentProvider;
}

async function upsertFact(
  prisma: Pick<PrismaClient, "researchFact">,
  params: {
    organisationId: string;
    subjectType: ResearchSubjectType;
    leadId?: string;
    companyId?: string;
    researchJobId: string;
    researchDocumentId?: string;
    sourceUrl: string;
    sourceTitle?: string;
    candidate: FactCandidate;
  },
): Promise<void> {
  assertAllowedCategory(params.candidate.category, params.subjectType);

  // Re-running research for the same subject must not pile up duplicate
  // facts every time — a fact is the same observation if the subject,
  // category, and value all match, regardless of which run produced it.
  const existing = await prisma.researchFact.findFirst({
    where: {
      organisationId: params.organisationId,
      leadId: params.leadId ?? null,
      companyId: params.companyId ?? null,
      category: params.candidate.category,
      value: params.candidate.value,
    },
  });

  if (existing) {
    await prisma.researchFact.update({
      where: { id: existing.id },
      data: { observedAt: new Date(), confidence: params.candidate.confidence },
    });
    return;
  }

  await prisma.researchFact.create({
    data: {
      organisationId: params.organisationId,
      subjectType: params.subjectType,
      leadId: params.leadId,
      companyId: params.companyId,
      researchJobId: params.researchJobId,
      researchDocumentId: params.researchDocumentId,
      category: params.candidate.category,
      value: params.candidate.value,
      sourceUrl: params.sourceUrl,
      sourceTitle: params.sourceTitle,
      extractionMethod: params.candidate.extractionMethod,
      confidence: params.candidate.confidence,
      evidenceExcerpt: params.candidate.evidenceExcerpt,
    },
  });
}

async function runWebsiteProvider(
  prisma: Prisma,
  job: {
    id: string;
    organisationId: string;
    subjectType: ResearchSubjectType;
    leadId: string | null;
    companyId: string | null;
  },
  targetUrl: string | null,
): Promise<void> {
  const existingRun = await prisma.researchProviderRun.findFirst({
    where: { researchJobId: job.id, provider: "WEBSITE" },
  });
  if (existingRun && (existingRun.status === "SUCCEEDED" || existingRun.status === "FAILED")) {
    return; // already attempted in a prior run of this job — don't refetch
  }

  const run =
    existingRun ??
    (await prisma.researchProviderRun.create({
      data: {
        researchJobId: job.id,
        provider: "WEBSITE",
        status: "RUNNING",
        startedAt: new Date(),
      },
    }));

  if (!targetUrl) {
    await prisma.researchProviderRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorMessage: "No website URL on record", completedAt: new Date() },
    });
    return;
  }

  try {
    const fetched = await fetchWebsite(targetUrl);
    const source = await prisma.researchSource.create({
      data: {
        researchProviderRunId: run.id,
        url: fetched.finalUrl,
        httpStatus: fetched.httpStatus,
      },
    });

    const jsonLdNodes = extractJsonLd(fetched.html);
    const openGraph = extractOpenGraph(fetched.html);
    const metaTags = extractMetaTags(fetched.html);

    const jsonLdFacts = factsFromJsonLdNodes(jsonLdNodes, job.subjectType);
    const ogFacts = jsonLdFacts.length === 0 ? factsFromOpenGraph(openGraph, job.subjectType) : [];
    const metaFacts =
      jsonLdFacts.length === 0 && ogFacts.length === 0
        ? factsFromMetaTags(metaTags, job.subjectType)
        : [];
    const candidates = [...jsonLdFacts, ...ogFacts, ...metaFacts];

    const document = await prisma.researchDocument.create({
      data: {
        researchSourceId: source.id,
        extractionMethod: candidates[0]?.extractionMethod ?? "META_TAG",
        extractedData: { jsonLd: jsonLdNodes, openGraph, metaTags } as object,
      },
    });

    for (const candidate of candidates) {
      await upsertFact(prisma, {
        organisationId: job.organisationId,
        subjectType: job.subjectType,
        leadId: job.leadId ?? undefined,
        companyId: job.companyId ?? undefined,
        researchJobId: job.id,
        researchDocumentId: document.id,
        sourceUrl: fetched.finalUrl,
        sourceTitle: metaTags.title,
        candidate,
      });
    }

    await prisma.researchProviderRun.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", completedAt: new Date() },
    });
  } catch (error) {
    const message =
      error instanceof WebsiteFetchError || error instanceof UnsafeUrlError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    await prisma.researchProviderRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
  }
}

async function recordProviderAvailability(
  prisma: Prisma,
  job: { id: string },
  provider: "SEARCH" | "NEWS" | "ENRICHMENT",
  configured: boolean,
): Promise<void> {
  const existingRun = await prisma.researchProviderRun.findFirst({
    where: { researchJobId: job.id, provider },
  });
  if (existingRun) return; // already recorded in a prior run

  await prisma.researchProviderRun.create({
    data: {
      researchJobId: job.id,
      provider,
      status: configured ? "SUCCEEDED" : "SKIPPED_NOT_CONFIGURED",
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
}

/**
 * The research job body — idempotent, safe to retry. Each provider run is
 * checkpointed independently (see runWebsiteProvider/recordProviderAvailability),
 * so a retry after a partial failure only redoes the providers that didn't
 * finish, and upsertFact prevents duplicate fact rows from a rerun.
 */
export async function processResearchJob(
  prisma: Prisma,
  providers: ResearchProviders,
  jobId: string,
): Promise<void> {
  const job = await prisma.researchJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status === "COMPLETED") return;

  await prisma.researchJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  let targetUrl: string | null = null;
  if (job.subjectType === "LEAD" && job.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: job.leadId } });
    targetUrl = lead?.websiteUrl ?? null;
  } else if (job.subjectType === "COMPANY" && job.companyId) {
    const company = await prisma.company.findUnique({ where: { id: job.companyId } });
    targetUrl = company?.websiteUrl ?? null;
  }

  await runWebsiteProvider(prisma, job, targetUrl);

  await recordProviderAvailability(prisma, job, "SEARCH", providers.search.isConfigured());
  await recordProviderAvailability(prisma, job, "NEWS", providers.news.isConfigured());
  await recordProviderAvailability(prisma, job, "ENRICHMENT", providers.enrichment.isConfigured());

  await prisma.researchJob.update({
    where: { id: jobId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}
