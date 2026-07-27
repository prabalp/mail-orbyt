import { isProhibitedCategory } from "./categories";
import { findByType, type JsonLdNode } from "./extraction/json-ld";
import type { MetaTags, OpenGraphTags } from "./extraction/open-graph";

export interface FactCandidate {
  category: string;
  value: string;
  confidence: number;
  extractionMethod: "JSON_LD" | "OPEN_GRAPH" | "META_TAG";
  evidenceExcerpt?: string;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
    return value.name.trim() || undefined;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter((v): v is string => Boolean(v));
  }
  const single = asString(value);
  return single ? [single] : [];
}

/**
 * Maps a schema.org `Person` JSON-LD node to fact candidates. Only maps
 * fields with an unambiguous, allowed category — e.g. `jobTitle` isn't
 * mapped here since it's already captured as a Lead field, not a research
 * fact. Every emitted category is checked against the prohibited list as a
 * defensive safety net, even though none of the mappings below should ever
 * produce one.
 */
export function factsFromPersonJsonLd(node: JsonLdNode): FactCandidate[] {
  const candidates: FactCandidate[] = [];

  const alumniOf = asStringArray(node.alumniOf);
  for (const school of alumniOf) {
    candidates.push({
      category: "relevant_education",
      value: school,
      confidence: 0.7,
      extractionMethod: "JSON_LD",
    });
  }

  const worksFor = asString(node.worksFor);
  if (worksFor) {
    candidates.push({
      category: "companies_worked_for",
      value: worksFor,
      confidence: 0.7,
      extractionMethod: "JSON_LD",
    });
  }

  for (const award of asStringArray(node.award ?? node.awards)) {
    candidates.push({
      category: "awards",
      value: award,
      confidence: 0.75,
      extractionMethod: "JSON_LD",
    });
  }

  for (const topic of asStringArray(node.knowsAbout)) {
    candidates.push({
      category: "professional_topics",
      value: topic,
      confidence: 0.6,
      extractionMethod: "JSON_LD",
    });
  }

  return candidates.filter((candidate) => !isProhibitedCategory(candidate.category));
}

/** Maps a schema.org `Organization` JSON-LD node to fact candidates. */
export function factsFromOrganizationJsonLd(node: JsonLdNode): FactCandidate[] {
  const candidates: FactCandidate[] = [];

  const description = asString(node.description);
  if (description) {
    candidates.push({
      category: "company_description",
      value: description,
      confidence: 0.7,
      extractionMethod: "JSON_LD",
      evidenceExcerpt: description.slice(0, 280),
    });
  }

  for (const award of asStringArray(node.award ?? node.awards)) {
    candidates.push({
      category: "awards",
      value: award,
      confidence: 0.75,
      extractionMethod: "JSON_LD",
    });
  }

  return candidates.filter((candidate) => !isProhibitedCategory(candidate.category));
}

export function factsFromJsonLdNodes(
  nodes: JsonLdNode[],
  subjectType: "LEAD" | "COMPANY",
): FactCandidate[] {
  if (subjectType === "LEAD") {
    return findByType(nodes, "Person").flatMap(factsFromPersonJsonLd);
  }
  return findByType(nodes, "Organization").flatMap(factsFromOrganizationJsonLd);
}

/** Open Graph's `og:description` is the only tag mapped to a fact — the rest (title, image, type, url) describe the page, not the subject. */
export function factsFromOpenGraph(
  tags: OpenGraphTags,
  subjectType: "LEAD" | "COMPANY",
): FactCandidate[] {
  const description = tags["og:description"];
  if (!description) return [];

  return [
    {
      category: subjectType === "LEAD" ? "professional_topics" : "company_description",
      value: description,
      confidence: 0.5,
      extractionMethod: "OPEN_GRAPH",
      evidenceExcerpt: description.slice(0, 280),
    },
  ];
}

/** The standard `<meta name="description">` tag, used only as a last-resort fallback when neither JSON-LD nor Open Graph produced a description-shaped fact. */
export function factsFromMetaTags(
  tags: MetaTags,
  subjectType: "LEAD" | "COMPANY",
): FactCandidate[] {
  if (!tags.description) return [];

  return [
    {
      category: subjectType === "LEAD" ? "professional_topics" : "company_description",
      value: tags.description,
      confidence: 0.35,
      extractionMethod: "META_TAG",
      evidenceExcerpt: tags.description.slice(0, 280),
    },
  ];
}
