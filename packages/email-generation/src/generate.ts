import type { AiEmailGenerator } from "./client";
import {
  BOOKING_LINK_PLACEHOLDER,
  buildGenerateEmailPrompt,
  buildReviewEmailPrompt,
} from "./prompt";
import { generateEmailInputSchema, type GenerateEmailInput, type GeneratedEmail } from "./types";
import { assertValidGeneratedEmail, GeneratedEmailValidationError } from "./validator";

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

  if (
    output.subject.includes(BOOKING_LINK_PLACEHOLDER) ||
    output.body.includes(BOOKING_LINK_PLACEHOLDER)
  ) {
    return {
      subject: output.subject.split(BOOKING_LINK_PLACEHOLDER).join(bookingLink),
      body: output.body.split(BOOKING_LINK_PLACEHOLDER).join(bookingLink),
    };
  }

  return { ...output, body: `${output.body}\n\nBook a time here: ${bookingLink}` };
}

/**
 * Appends the closing signature deterministically — the model is instructed
 * (system prompt rule 5) never to write its own sign-off, so there is no
 * "already signed?" check to make here; this is the only place a signature
 * is ever written into the body. `signatureText` is the sending inbox's
 * configured Signature.content when one exists, otherwise callers pass the
 * plain "Best,\n{senderName}" fallback. Any `{senderName}` token in either is
 * substituted here, so a user-authored Signature.content template works the
 * same way as the fallback.
 */
function applySignature(
  output: GeneratedEmail,
  signatureText: string,
  senderName: string,
): GeneratedEmail {
  const resolvedSignature = signatureText.replace(/\{senderName\}/g, senderName);
  return { ...output, body: `${output.body}\n\n${resolvedSignature}` };
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
  options: { campaignPrompt?: string; reviewSystemPromptOverride?: string },
): Promise<GeneratedEmail> {
  try {
    const reviewed = await generator.complete(buildReviewEmailPrompt(output, options));
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
  // The QA pass sees the same campaign instructions the draft was written to,
  // so it corrects against this campaign's format rather than a house style.
  const reviewed = await reviewEmail(generator, output, parsed.facts, {
    campaignPrompt: parsed.campaignPrompt,
    reviewSystemPromptOverride: parsed.reviewSystemPromptOverride,
  });
  const signatureText = parsed.signatureText ?? "Best,\n{senderName}";
  return applySignature(
    applyBookingLink(reviewed, parsed.bookingLink),
    signatureText,
    parsed.senderName,
  );
}

export { GeneratedEmailValidationError } from "./validator";
export type { AiEmailGenerator } from "./client";
