import type { AllowedFact, GeneratedEmail } from "./types";

export class GeneratedEmailValidationError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`Generated email failed validation: ${violations.join("; ")}`);
    this.name = "GeneratedEmailValidationError";
    this.violations = violations;
  }
}

export const URL_PATTERN = /https?:\/\/[^\s)]+/gi;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*?>/i;
const RESEARCH_DISCLOSURE_PATTERNS = [
  /based on (my|our) research/i,
  /while (researching|browsing|searching)/i,
  /according to (my|our) search/i,
  /as an ai/i,
  /i (was )?generated (this|by)/i,
];
const MAX_BODY_WORDS = 220;

export function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Deterministic, non-AI post-generation checks. These run on every model
 * output before it's shown to a user or persisted — they exist because the
 * model is a black box and the system prompt is a request, not a guarantee.
 * A caller that gets violations back should retry generation (once) or
 * surface an error; it must never persist or send an email that failed
 * these checks.
 */
export function validateGeneratedEmail(output: GeneratedEmail, facts: AllowedFact[]): string[] {
  const violations: string[] = [];
  const combinedText = `${output.subject}\n${output.body}`;

  if (HTML_TAG_PATTERN.test(combinedText)) {
    violations.push("contains HTML markup, which is not allowed in a plain-text email");
  }

  const allowedHostnames = new Set(
    facts
      .map((fact) => extractHostname(fact.sourceUrl))
      .filter((host): host is string => Boolean(host)),
  );
  for (const match of combinedText.matchAll(URL_PATTERN)) {
    const hostname = extractHostname(match[0]);
    if (!hostname || !allowedHostnames.has(hostname)) {
      violations.push(`references a URL not present in the provided facts: ${match[0]}`);
    }
  }

  for (const match of combinedText.matchAll(EMAIL_PATTERN)) {
    violations.push(`references an email address not provided by the caller: ${match[0]}`);
  }

  for (const pattern of RESEARCH_DISCLOSURE_PATTERNS) {
    if (pattern.test(combinedText)) {
      violations.push(
        "discloses AI/research methodology, which must never appear in the email itself",
      );
    }
  }

  const wordCount = output.body.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > MAX_BODY_WORDS) {
    violations.push(`body is too long (${wordCount} words, max ${MAX_BODY_WORDS})`);
  }

  return violations;
}

export function assertValidGeneratedEmail(output: GeneratedEmail, facts: AllowedFact[]): void {
  const violations = validateGeneratedEmail(output, facts);
  if (violations.length > 0) {
    throw new GeneratedEmailValidationError(violations);
  }
}
