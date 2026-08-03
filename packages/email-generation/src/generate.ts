import type { AiEmailGenerator } from "./client";
import {
  BOOKING_LINK_PLACEHOLDER,
  buildGenerateEmailPrompt,
  buildReviewEmailPrompt,
  buildRewriteEmailPrompt,
} from "./prompt";
import {
  generateEmailInputSchema,
  rewriteEmailInputSchema,
  type GenerateEmailInput,
  type GeneratedEmail,
  type RewriteEmailInput,
} from "./types";
import { assertValidGeneratedEmail, GeneratedEmailValidationError, URL_PATTERN } from "./validator";

const MAX_ATTEMPTS = 2;

/**
 * Runs `complete` up to MAX_ATTEMPTS times, re-validating each attempt with
 * the deterministic validator. The model is a black box, so a single
 * malformed/rule-breaking response isn't treated as fatal — but repeated
 * failures are, rather than silently returning something the validator
 * flagged.
 */
async function completeWithValidation(
  generator: AiEmailGenerator,
  prompt: { system: string; user: string },
  facts: { category: string; value: string; sourceUrl: string }[],
): Promise<GeneratedEmail> {
  let lastError: GeneratedEmailValidationError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const output = await generator.complete(prompt);
    try {
      assertValidGeneratedEmail(output, facts);
      return output;
    } catch (error) {
      if (!(error instanceof GeneratedEmailValidationError)) throw error;
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * Replaces the booking-link placeholder with the real URL (the model only
 * ever sees/echoes the placeholder token, never the URL itself, so this
 * substitution is the only place the link's actual characters are written —
 * it cannot be mangled by the model because the model never produces them).
 * If the model dropped the placeholder entirely, the link is still
 * guaranteed to appear via a deterministic fallback line.
 */
function applyBookingLink(output: GeneratedEmail, bookingLink: string | undefined): GeneratedEmail {
  if (!bookingLink) return output;

  if (output.subject.includes(BOOKING_LINK_PLACEHOLDER) || output.body.includes(BOOKING_LINK_PLACEHOLDER)) {
    return {
      subject: output.subject.split(BOOKING_LINK_PLACEHOLDER).join(bookingLink),
      body: output.body.split(BOOKING_LINK_PLACEHOLDER).join(bookingLink),
    };
  }

  return { ...output, body: `${output.body}\n\nBook a time here: ${bookingLink}` };
}

/**
 * Appends the closing signature deterministically — the model is instructed
 * (system prompt rule 9) never to write its own sign-off, so there is no
 * "already signed?" check to make here; this is the only place a signature
 * is ever written into the body. `signatureText` is the sending inbox's
 * configured Signature.content when one exists, otherwise callers pass the
 * plain "Best,\n{senderName}" fallback.
 */
function applySignature(output: GeneratedEmail, signatureText: string): GeneratedEmail {
  return { ...output, body: `${output.body}\n\n${signatureText}` };
}

/**
 * Runs the AI's own QA self-review pass over the subject/body — before the
 * booking link and signature are substituted in, so the same fact/URL
 * allow-list used for the original generation still applies (the real
 * booking URL and signature would otherwise trip the URL/email checks,
 * since neither is in `facts`). A review that fails validation (e.g. the
 * model "corrected" something into a fact/URL violation) is discarded — the
 * review pass must never be the thing that introduces a violation, so on
 * any doubt the pre-review output wins.
 */
async function reviewEmail(
  generator: AiEmailGenerator,
  output: GeneratedEmail,
  facts: { category: string; value: string; sourceUrl: string }[],
): Promise<GeneratedEmail> {
  try {
    const reviewed = await generator.complete(buildReviewEmailPrompt(output));
    assertValidGeneratedEmail(reviewed, facts);
    return reviewed;
  } catch {
    return output;
  }
}

/** Generates an initial, follow-up, or close-the-loop email from a bounded set of researched facts. */
export async function generateEmail(
  generator: AiEmailGenerator,
  input: GenerateEmailInput,
): Promise<GeneratedEmail> {
  const parsed = generateEmailInputSchema.parse(input);
  if (
    (parsed.generationType === "FOLLOW_UP" || parsed.generationType === "CLOSE_THE_LOOP") &&
    !parsed.priorEmail
  ) {
    throw new Error(`${parsed.generationType} requires a priorEmail to reference.`);
  }

  const prompt = buildGenerateEmailPrompt(parsed);
  const output = await completeWithValidation(generator, prompt, parsed.facts);
  const reviewed = await reviewEmail(generator, output, parsed.facts);
  const signatureText = parsed.signatureText ?? `Best,\n${parsed.senderName}`;
  return applySignature(applyBookingLink(reviewed, parsed.bookingLink), signatureText);
}

/** Rewrites an existing email's tone/length without introducing new facts. */
export async function rewriteEmail(
  generator: AiEmailGenerator,
  input: RewriteEmailInput,
): Promise<GeneratedEmail> {
  const parsed = rewriteEmailInputSchema.parse(input);
  const prompt = buildRewriteEmailPrompt(parsed);
  // A rewrite may only reference URLs already present in the original email
  // (e.g. an already-embedded booking link) — never a new one. The allow-
  // list is built from the original's own URLs rather than left empty, so
  // the validator's URL check permits keeping them but rejects anything new.
  const originalUrls = [...`${parsed.subject}\n${parsed.body}`.matchAll(URL_PATTERN)].map(
    (match) => match[0],
  );
  const originalUrlFacts = originalUrls.map((url) => ({
    category: "original_email_url",
    value: url,
    sourceUrl: url,
  }));
  return completeWithValidation(generator, prompt, originalUrlFacts);
}

export { GeneratedEmailValidationError } from "./validator";
export type { AiEmailGenerator } from "./client";
