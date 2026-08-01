/**
 * Fact category taxonomy. Stored as a plain validated string on
 * ResearchFact (not a Prisma enum — ~50 categories across person/company,
 * easier to extend here than via migration), but every write must pass
 * `assertAllowedCategory` so an unlisted or explicitly prohibited category
 * can never reach the database.
 */

export const PERSON_FACT_CATEGORIES = [
  "professional_topics",
  "books_written_or_discussed",
  "previous_roles",
  "companies_worked_for",
  "brands_worked_with",
  "conference_participation",
  "speaking_events",
  "webinars",
  "podcasts",
  "interviews",
  "methodology",
  "frameworks",
  "awards",
  "professional_beliefs",
  "professional_opinions",
  "publications",
  "newsletters",
  "research_papers",
  "public_projects",
  "relevant_education",
  "certifications",
  "professional_communities",
  "public_quotes",
  "stated_priorities",
  "recent_role_changes",
  "hiring_context",
  "tools_publicly_discussed",
  "recent_professional_activity",
  "relevant_business_triggers",
  "vocabulary_and_terminology",
  "public_case_studies",
  "extracted_keywords",
] as const;

export const COMPANY_FACT_CATEGORIES = [
  "company_description",
  "products",
  "services",
  "industry",
  "business_model",
  "customer_segments",
  "public_clients",
  "case_studies",
  "leadership",
  "locations",
  "public_partnerships",
  "funding",
  "hiring_activity",
  "awards",
  "product_launches",
  "recent_news",
  "technology_indicators",
  "expansion_activity",
  "public_business_priorities",
  "publicly_stated_challenges",
  "relevant_use_cases",
  "extracted_keywords",
] as const;

/**
 * Never permitted, regardless of subject type or source — checked before
 * every fact write. These categories exist to enumerate what deterministic
 * extraction must never classify a fact as, not to suggest such data should
 * be collected under a different label.
 */
export const PROHIBITED_FACT_CATEGORIES = [
  "health",
  "religion",
  "political_affiliation",
  "sexual_orientation",
  "family_information",
  "private_addresses",
  "private_phone_numbers",
  "personal_financial_information",
  "psychological_inference",
  "private_social_media_content",
] as const;

export type PersonFactCategory = (typeof PERSON_FACT_CATEGORIES)[number];
export type CompanyFactCategory = (typeof COMPANY_FACT_CATEGORIES)[number];
export type ProhibitedFactCategory = (typeof PROHIBITED_FACT_CATEGORIES)[number];

const PERSON_SET = new Set<string>(PERSON_FACT_CATEGORIES);
const COMPANY_SET = new Set<string>(COMPANY_FACT_CATEGORIES);
const PROHIBITED_SET = new Set<string>(PROHIBITED_FACT_CATEGORIES);

export class ProhibitedCategoryError extends Error {
  constructor(category: string) {
    super(`Category "${category}" is prohibited and can never be stored as a research fact`);
    this.name = "ProhibitedCategoryError";
  }
}

export class UnknownCategoryError extends Error {
  constructor(category: string, subjectType: "LEAD" | "COMPANY") {
    super(`"${category}" is not a recognized fact category for subject type ${subjectType}`);
    this.name = "UnknownCategoryError";
  }
}

export function isProhibitedCategory(category: string): boolean {
  return PROHIBITED_SET.has(category);
}

/**
 * Throws if the category is prohibited outright, or isn't in the allow-list
 * for the given subject type. Call this before every ResearchFact write —
 * extraction code must never bypass it.
 */
export function assertAllowedCategory(category: string, subjectType: "LEAD" | "COMPANY"): void {
  if (isProhibitedCategory(category)) {
    throw new ProhibitedCategoryError(category);
  }
  const allowed = subjectType === "LEAD" ? PERSON_SET : COMPANY_SET;
  if (!allowed.has(category)) {
    throw new UnknownCategoryError(category, subjectType);
  }
}
