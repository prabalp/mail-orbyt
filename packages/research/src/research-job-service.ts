import type { ExtractionMethod, PrismaClient, ResearchSubjectType } from "@mail-orbyt/database";
import { assertAllowedCategory } from "./categories";
import { extractJsonLd } from "./extraction/json-ld";
import { extractMetaTags, extractOpenGraph } from "./extraction/open-graph";
import { extractVisibleText } from "./extraction/page-text";
import { factsFromJsonLdNodes, factsFromMetaTags, factsFromOpenGraph } from "./facts-from-document";
import type { EnrichmentProvider, NewsProvider, SearchProvider } from "./providers";
import { fetchWebsite, WebsiteFetchError } from "./website-fetcher";
import { UnsafeUrlError } from "./ssrf-guard";

type Prisma = Pick<
  PrismaClient,
  | "researchJob"
  | "researchProviderRun"
  | "researchSource"
  | "researchDocument"
  | "researchPageText"
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

export interface UpsertResearchFactParams {
  organisationId: string;
  subjectType: ResearchSubjectType;
  leadId?: string;
  companyId?: string;
  researchJobId?: string;
  researchDocumentId?: string;
  sourceUrl: string;
  sourceTitle?: string;
  category: string;
  value: string;
  confidence: number;
  extractionMethod: ExtractionMethod;
  evidenceExcerpt?: string;
}

/**
 * Writes (or refreshes) a single ResearchFact, deduping on subject+category+
 * value so re-running research/keyword-extraction for the same subject never
 * piles up duplicate facts. Shared by the website provider below and by
 * packages/research-keywords, which is why it's exported and takes a flat
 * ExtractionMethod rather than the narrower website-only FactCandidate shape.
 */
export async function upsertResearchFact(
  prisma: Pick<PrismaClient, "researchFact">,
  params: UpsertResearchFactParams,
): Promise<void> {
  assertAllowedCategory(params.category, params.subjectType);

  const existing = await prisma.researchFact.findFirst({
    where: {
      organisationId: params.organisationId,
      leadId: params.leadId ?? null,
      companyId: params.companyId ?? null,
      category: params.category,
      value: params.value,
    },
  });

  if (existing) {
    await prisma.researchFact.update({
      where: { id: existing.id },
      data: { observedAt: new Date(), confidence: params.confidence },
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
      category: params.category,
      value: params.value,
      sourceUrl: params.sourceUrl,
      sourceTitle: params.sourceTitle,
      extractionMethod: params.extractionMethod,
      confidence: params.confidence,
      evidenceExcerpt: params.evidenceExcerpt,
    },
  });
}

/**
 * Finds the existing ResearchSource for this subject+URL and updates it in
 * place (httpStatus/fetchedAt/researchProviderRunId), or creates one if this
 * is the first time this subject's website has been fetched. This is what
 * keeps reruns from piling up duplicate rows — the URL's content is the same
 * fetch target every time, so it's one continuously-refreshed row, not one
 * per research run.
 */
async function findOrCreateResearchSource(
  prisma: Prisma,
  job: {
    organisationId: string;
    subjectType: ResearchSubjectType;
    leadId: string | null;
    companyId: string | null;
  },
  fetched: { finalUrl: string; httpStatus: number },
  providerRunId: string,
) {
  const existing = await prisma.researchSource.findFirst({
    where: {
      organisationId: job.organisationId,
      subjectType: job.subjectType,
      leadId: job.leadId,
      companyId: job.companyId,
      url: fetched.finalUrl,
    },
  });

  if (existing) {
    return prisma.researchSource.update({
      where: { id: existing.id },
      data: {
        httpStatus: fetched.httpStatus,
        fetchedAt: new Date(),
        researchProviderRunId: providerRunId,
      },
    });
  }

  return prisma.researchSource.create({
    data: {
      organisationId: job.organisationId,
      subjectType: job.subjectType,
      leadId: job.leadId ?? undefined,
      companyId: job.companyId ?? undefined,
      url: fetched.finalUrl,
      httpStatus: fetched.httpStatus,
      researchProviderRunId: providerRunId,
    },
  });
}

/** Returns the id of the ResearchSource the WEBSITE provider produced (existing or new), or null if it never succeeded. */
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
): Promise<string | null> {
  const existingRun = await prisma.researchProviderRun.findFirst({
    where: { researchJobId: job.id, provider: "WEBSITE" },
  });
  if (existingRun && (existingRun.status === "SUCCEEDED" || existingRun.status === "FAILED")) {
    if (existingRun.status === "FAILED") return null;
    // already attempted in a prior run of this job — don't refetch, just report the source it produced
    const existingSource = await prisma.researchSource.findFirst({
      where: { researchProviderRunId: existingRun.id },
    });
    return existingSource?.id ?? null;
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
    return null;
  }

  try {
    const fetched = await fetchWebsite(targetUrl);
    const source = await findOrCreateResearchSource(prisma, job, fetched, run.id);

    // Saved unconditionally on a successful fetch, independent of whether
    // structured extraction below finds anything — this is what lets
    // keyword extraction (and any future re-processing) run later without
    // re-fetching the site. Upserted (not inserted) since the source row
    // itself is now reused across reruns. See ResearchPageText in
    // schema.prisma.
    const visibleText = extractVisibleText(fetched.html);
    await prisma.researchPageText.upsert({
      where: { researchSourceId: source.id },
      create: { researchSourceId: source.id, text: visibleText, charCount: visibleText.length },
      update: { text: visibleText, charCount: visibleText.length, extractedAt: new Date() },
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

    const document = await prisma.researchDocument.upsert({
      where: { researchSourceId: source.id },
      create: {
        researchSourceId: source.id,
        extractionMethod: candidates[0]?.extractionMethod ?? "META_TAG",
        extractedData: { jsonLd: jsonLdNodes, openGraph, metaTags } as object,
      },
      update: {
        extractionMethod: candidates[0]?.extractionMethod ?? "META_TAG",
        extractedData: { jsonLd: jsonLdNodes, openGraph, metaTags } as object,
      },
    });

    for (const candidate of candidates) {
      await upsertResearchFact(prisma, {
        organisationId: job.organisationId,
        subjectType: job.subjectType,
        leadId: job.leadId ?? undefined,
        companyId: job.companyId ?? undefined,
        researchJobId: job.id,
        researchDocumentId: document.id,
        sourceUrl: fetched.finalUrl,
        sourceTitle: metaTags.title,
        category: candidate.category,
        value: candidate.value,
        confidence: candidate.confidence,
        extractionMethod: candidate.extractionMethod,
        evidenceExcerpt: candidate.evidenceExcerpt,
      });
    }

    await prisma.researchProviderRun.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", completedAt: new Date() },
    });
    return source.id;
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
    return null;
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

export interface ProcessResearchJobResult {
  /** The ResearchSource produced by the WEBSITE provider, if it succeeded — the id keyword extraction should be enqueued against. Null if the fetch failed or there was no website URL on record. */
  websiteSourceId: string | null;
}

/**
 * The research job body — idempotent, safe to retry. Each provider run is
 * checkpointed independently (see runWebsiteProvider/recordProviderAvailability),
 * so a retry after a partial failure only redoes the providers that didn't
 * finish, and upsertResearchFact prevents duplicate fact rows from a rerun.
 */
export async function processResearchJob(
  prisma: Prisma,
  providers: ResearchProviders,
  jobId: string,
): Promise<ProcessResearchJobResult> {
  const job = await prisma.researchJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status === "COMPLETED") {
    const existingRun = await prisma.researchProviderRun.findFirst({
      where: { researchJobId: jobId, provider: "WEBSITE", status: "SUCCEEDED" },
    });
    const existingSource = existingRun
      ? await prisma.researchSource.findFirst({ where: { researchProviderRunId: existingRun.id } })
      : null;
    return { websiteSourceId: existingSource?.id ?? null };
  }

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

  const websiteSourceId = await runWebsiteProvider(prisma, job, targetUrl);

  await recordProviderAvailability(prisma, job, "SEARCH", providers.search.isConfigured());
  await recordProviderAvailability(prisma, job, "NEWS", providers.news.isConfigured());
  await recordProviderAvailability(prisma, job, "ENRICHMENT", providers.enrichment.isConfigured());

  await prisma.researchJob.update({
    where: { id: jobId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  return { websiteSourceId };
}
