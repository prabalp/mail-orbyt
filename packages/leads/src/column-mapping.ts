export const CANONICAL_COLUMNS = [
  "first_name",
  "last_name",
  "title",
  "company",
  "linkedin_url",
  "website_url",
  "email",
  "industry",
  "city",
  "state",
  "country",
  "total_mails",
  "emails",
] as const;

export type CanonicalColumn = (typeof CANONICAL_COLUMNS)[number];

/** Known header aliases seen in real-world CSV exports, keyed by canonical column. Matching is deterministic string comparison — no AI/fuzzy inference. */
const COLUMN_ALIASES: Record<CanonicalColumn, string[]> = {
  first_name: ["first name", "firstname", "given name", "fname"],
  last_name: ["last name", "lastname", "surname", "family name", "lname"],
  title: ["job title", "position", "role", "job_title"],
  company: ["company name", "organization", "organisation", "employer", "company_name"],
  linkedin_url: ["linkedin", "linkedin profile", "linkedin_profile"],
  website_url: ["website", "company website", "domain", "url", "company_website"],
  email: ["email address", "e-mail", "work email", "email_address"],
  industry: ["sector", "vertical"],
  city: ["town"],
  state: ["province", "region"],
  country: ["nation"],
  total_mails: ["total mails", "total emails", "email count", "mail count"],
  emails: ["email bodies", "imported emails", "prewritten emails"],
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Suggests a canonical-column -> source-header mapping by exact
 * (normalized) match against the canonical name or its known aliases.
 * Returns null for any canonical column with no confident match — the
 * import UI lets the user assign those manually rather than guessing.
 */
export function suggestColumnMapping(headers: string[]): Record<CanonicalColumn, string | null> {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  const mapping = {} as Record<CanonicalColumn, string | null>;

  for (const canonical of CANONICAL_COLUMNS) {
    const candidates = [
      normalizeHeader(canonical),
      ...COLUMN_ALIASES[canonical].map(normalizeHeader),
    ];
    const match = normalizedHeaders.find((h) => candidates.includes(h.normalized));
    mapping[canonical] = match?.original ?? null;
  }

  return mapping;
}

/** Applies a confirmed canonical-column -> source-header mapping to one raw CSV row. */
export function applyColumnMapping(
  rawValues: Record<string, string>,
  mapping: Record<CanonicalColumn, string | null>,
): Partial<Record<CanonicalColumn, string>> {
  const result: Partial<Record<CanonicalColumn, string>> = {};
  for (const canonical of CANONICAL_COLUMNS) {
    const sourceHeader = mapping[canonical];
    if (sourceHeader && sourceHeader in rawValues) {
      result[canonical] = rawValues[sourceHeader];
    }
  }
  return result;
}
