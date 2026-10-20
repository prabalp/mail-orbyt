import type { GenerateSocialContentInput, SocialContentValidationResult } from "./types";
import type { SocialPlatformName } from "./types";

/** Per-platform character limits used only for the deterministic auto-fix (truncation) — content is never rejected solely for length. */
export const PLATFORM_LENGTH_LIMITS: Record<SocialPlatformName, number> = {
  TWITTER: 280,
  THREADS: 500,
  LINKEDIN: 3000,
  INSTAGRAM: 2200,
  REDDIT: 10_000,
};

const ELLIPSIS = "…";

const URL_PATTERN = /https?:\/\/\S+/i;
const EMAIL_PATTERN = /\S+@\S+\.\S+/;
const PHONE_PATTERN = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const CREDIT_CARD_PATTERN = /\b(?:\d[ -]*?){13,16}\b/;

/**
 * Whether the content contains any http(s) URL at all. There is no per-org
 * domain allowlist here — this module has no notion of "the org's own
 * domain" — so any URL is flagged as requiring escalation. A real per-org
 * domain allowlist (letting a brand link to its own site freely) belongs in
 * packages/social-policy, layered on top of this flag, not here.
 */
export function containsUnverifiedUrl(content: string): boolean {
  return URL_PATTERN.test(content);
}

function truncateToLimit(content: string, limit: number): string {
  if (content.length <= limit) return content;
  const sliceLength = Math.max(0, limit - ELLIPSIS.length);
  return `${content.slice(0, sliceLength).trimEnd()}${ELLIPSIS}`;
}

/** Simple, dependency-free normalized-substring similarity check — no fuzzy-matching library needed for this. */
function matchesPriorEscalationPhrase(content: string, priorEscalationPhrases: string[]): boolean {
  const normalizedContent = content.trim().toLowerCase();
  return priorEscalationPhrases.some((phrase) => {
    const normalizedPhrase = phrase.trim().toLowerCase();
    if (!normalizedPhrase) return false;
    return normalizedContent.includes(normalizedPhrase) || normalizedPhrase.includes(normalizedContent);
  });
}

/**
 * Deterministic, non-AI post-generation checks — no LLM call anywhere in
 * this module. Every generated post/reply must be run through this before
 * being shown to a user, persisted, or posted. Mirrors
 * email-generation/validator.ts's role for the email pipeline.
 */
export function validateSocialContent(
  content: string,
  input: GenerateSocialContentInput,
  priorEscalationPhrases: string[] = [],
): SocialContentValidationResult {
  const violations: string[] = [];

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      fixedContent: content,
      requiredAutoFix: false,
      violations: ["content is empty or whitespace-only"],
    };
  }

  const limit = PLATFORM_LENGTH_LIMITS[input.platform];
  const requiredAutoFix = content.length > limit;
  const fixedContent = requiredAutoFix ? truncateToLimit(content, limit) : content;

  if (containsUnverifiedUrl(fixedContent)) {
    violations.push(
      "contains a URL, which cannot be verified against an allowed-domain list here and requires escalation before posting",
    );
  }

  if (EMAIL_PATTERN.test(fixedContent)) {
    violations.push("contains what looks like an email address");
  }
  if (PHONE_PATTERN.test(fixedContent)) {
    violations.push("contains what looks like a phone number");
  }
  if (CREDIT_CARD_PATTERN.test(fixedContent)) {
    violations.push("contains what looks like a credit-card number");
  }

  const piiViolationCount = violations.length;

  if (matchesPriorEscalationPhrase(fixedContent, priorEscalationPhrases)) {
    violations.push("closely matches a phrase that previously required escalation");
  }

  // Only the URL/PII checks are rejecting; length is auto-fixed (never a
  // rejection reason on its own), and the prior-escalation-phrase match is a
  // flag, not a rejection.
  const valid = piiViolationCount === 0;

  return { valid, fixedContent, requiredAutoFix, violations };
}

/**
 * Combines the model's own self-reported confidence with deterministic
 * penalties from the validator, clamped to [0, 1].
 *
 * packages/social-policy consumes ONLY this composite value, never the raw
 * model self-report — a model cannot bypass escalation just by claiming high
 * confidence, because nothing downstream of this function ever sees that
 * raw number.
 */
export function computeCompositeConfidence(
  modelSelfReportedConfidence: number,
  validation: SocialContentValidationResult,
): number {
  let confidence = modelSelfReportedConfidence;
  if (validation.requiredAutoFix) confidence -= 0.3;
  if (validation.violations.length > 0) confidence -= 0.4;
  return Math.min(1, Math.max(0, confidence));
}
