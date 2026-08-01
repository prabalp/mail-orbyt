import type { ExtractionMethod, PrismaClient, ResearchSubjectType } from "@mail-orbyt/database";
import { assertAllowedCategory } from "@mail-orbyt/research";
import { getKeywordExtractionMode } from "./config";
import { isAiConfigured, extractKeywordsWithAi } from "./client";
import { extractKeywordsDeterministic, type KeywordCandidate } from "./deterministic";

const KEYWORDS_CATEGORY = "extracted_keywords";

type Prisma = Pick<
  PrismaClient,
  "researchSource" | "researchPageText" | "researchKeywordRun" | "researchFact"
>;

const EXCERPT_RADIUS = 60;

/** Deterministically slices a short excerpt around a keyword's first occurrence in the saved page text — even AI-picked keywords stay traceable to a literal piece of the saved source, never an AI-generated claim. */
function excerptAround(text: string, keyword: string): string | undefined {
  const index = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (index === -1) return undefined;
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + keyword.length + EXCERPT_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/**
 * Writes all extracted keywords as a single comma-separated ResearchFact
 * (rather than one row per keyword), upserted by (organisation, subject,
 * category) alone — ignoring the fact's value — so a rerun always refreshes
 * the same row instead of creating a new one each time the keyword set
 * shifts slightly. confidence is the average of the individual keyword
 * scores; evidenceExcerpt is a representative excerpt around the top
 * keyword only (a single excerpt can't ground every keyword in the list).
 */
async function upsertKeywordsFact(
  prisma: Pick<PrismaClient, "researchFact">,
  subject: {
    organisationId: string;
    subjectType: ResearchSubjectType;
    leadId: string | null;
    companyId: string | null;
    url: string;
    title: string | null;
  },
  pageText: string,
  candidates: KeywordCandidate[],
  extractionMethod: ExtractionMethod,
): Promise<void> {
  const [topCandidate] = candidates;
  if (!topCandidate) return;

  assertAllowedCategory(KEYWORDS_CATEGORY, subject.subjectType);

  const value = candidates.map((candidate) => candidate.keyword).join(", ");
  const confidence =
    candidates.reduce((sum, candidate) => sum + candidate.score, 0) / candidates.length;
  const evidenceExcerpt = excerptAround(pageText, topCandidate.keyword);

  const existing = await prisma.researchFact.findFirst({
    where: {
      organisationId: subject.organisationId,
      leadId: subject.leadId,
      companyId: subject.companyId,
      category: KEYWORDS_CATEGORY,
    },
  });

  if (existing) {
    await prisma.researchFact.update({
      where: { id: existing.id },
      data: { value, confidence, extractionMethod, evidenceExcerpt, observedAt: new Date() },
    });
    return;
  }

  await prisma.researchFact.create({
    data: {
      organisationId: subject.organisationId,
      subjectType: subject.subjectType,
      leadId: subject.leadId ?? undefined,
      companyId: subject.companyId ?? undefined,
      category: KEYWORDS_CATEGORY,
      value,
      sourceUrl: subject.url,
      sourceTitle: subject.title ?? undefined,
      extractionMethod,
      confidence,
      evidenceExcerpt,
    },
  });
}

/**
 * Reads the already-saved ResearchPageText for a source and writes keyword
 * facts from it — never re-fetches the website. Each call is its own
 * ResearchKeywordRun, so this is safe (and expected) to invoke repeatedly on
 * demand, e.g. after tuning KEYWORD_EXTRACTION_MODE or the extraction logic.
 */
export async function processKeywordExtractionJob(
  prisma: Prisma,
  researchSourceId: string,
): Promise<void> {
  const source = await prisma.researchSource.findUniqueOrThrow({
    where: { id: researchSourceId },
    include: { pageText: true },
  });

  const mode = getKeywordExtractionMode();

  const run = await prisma.researchKeywordRun.create({
    data: {
      organisationId: source.organisationId,
      researchSourceId,
      mode: mode === "ai" ? "AI" : "DETERMINISTIC",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  if (!source.pageText) {
    await prisma.researchKeywordRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: "No saved page text for this source — run research first",
        completedAt: new Date(),
      },
    });
    return;
  }

  try {
    let candidates: KeywordCandidate[];
    let extractionMethod: ExtractionMethod;
    let fallbackNote: string | undefined;

    if (mode === "ai" && isAiConfigured()) {
      candidates = await extractKeywordsWithAi(source.pageText.text);
      extractionMethod = "AI_KEYWORD";
    } else {
      candidates = extractKeywordsDeterministic(source.pageText.text);
      extractionMethod = "KEYWORD_FREQUENCY";
      if (mode === "ai") {
        fallbackNote =
          "KEYWORD_EXTRACTION_MODE=ai but no AI_PROVIDER_API_KEY configured — used the deterministic extractor instead.";
      }
    }

    await upsertKeywordsFact(prisma, source, source.pageText.text, candidates, extractionMethod);

    await prisma.researchKeywordRun.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", errorMessage: fallbackNote, completedAt: new Date() },
    });
  } catch (error) {
    await prisma.researchKeywordRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });
  }
}
