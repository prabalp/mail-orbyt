/**
 * Deterministic (no AI) field normalization for lead/company data, used by
 * CSV import and anywhere else structured lead data is written. Every
 * function here is a pure string transform — no network calls, no
 * inference, nothing that could hallucinate a value.
 */

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeEmail(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

export function normalizeName(value: string): string {
  const cleaned = normalizeWhitespace(value);
  return cleaned
    .split(" ")
    .map((part) =>
      part
        .split("-")
        .map((segment) =>
          segment ? segment[0]?.toUpperCase() + segment.slice(1).toLowerCase() : segment,
        )
        .join("-"),
    )
    .join(" ");
}

export function normalizeJobTitle(value: string): string {
  return normalizeWhitespace(value);
}

/** Adds an https:// scheme if missing and lowercases the host; leaves the path/query as-is. */
export function normalizeUrl(value: string): string {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return trimmed;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
}

/** Extracts the registrable-ish domain (lowercased host, no scheme/path) from a URL or bare domain string. */
export function extractDomain(value: string): string | null {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function extractDomainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  return email.slice(at + 1).toLowerCase() || null;
}

/** Common country name variants seen in CSV exports, mapped to a canonical form. Not exhaustive by design — unknown values pass through trimmed/whitespace-normalized. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "u.s.a.": "United States",
  "u.s.": "United States",
  "united states of america": "United States",
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  "great britain": "United Kingdom",
};

export function normalizeCountry(value: string): string {
  const cleaned = normalizeWhitespace(value);
  const alias = COUNTRY_ALIASES[cleaned.toLowerCase()];
  return alias ?? cleaned;
}

export function normalizeState(value: string): string {
  return normalizeWhitespace(value);
}
