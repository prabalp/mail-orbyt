import type { AiEmailGenerator } from "./client";
import { BOOKING_LINK_PLACEHOLDER, buildGenerateEmailPrompt, buildRewriteEmailPrompt } from "./prompt";
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
 * Guarantees the email closes with the sender's real name, regardless of
 * whether the model followed the system prompt's sign-off rule — a
 * malformed/missing signature is exactly the kind of thing the model (a
 * black box) can silently drop, so this is checked deterministically rather
 * than trusted.
 */
function applySignature(output: GeneratedEmail, senderName: string): GeneratedEmail {
  const alreadySigned = output.body.trimEnd().toLowerCase().endsWith(senderName.toLowerCase());
  if (alreadySigned) return output;
  return { ...output, body: `${output.body}\n\nBest,\n${senderName}` };
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
  return applySignature(applyBookingLink(output, parsed.bookingLink), parsed.senderName);
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
