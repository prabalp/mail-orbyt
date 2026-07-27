import type { AiEmailGenerator } from "./client";
import { buildGenerateEmailPrompt, buildRewriteEmailPrompt } from "./prompt";
import {
  generateEmailInputSchema,
  rewriteEmailInputSchema,
  type GenerateEmailInput,
  type GeneratedEmail,
  type RewriteEmailInput,
} from "./types";
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
  return completeWithValidation(generator, prompt, parsed.facts);
}

/** Rewrites an existing email's tone/length without introducing new facts. Prior facts are re-checked against the ORIGINAL body's URLs/emails, since a rewrite must not add any. */
export async function rewriteEmail(
  generator: AiEmailGenerator,
  input: RewriteEmailInput,
): Promise<GeneratedEmail> {
  const parsed = rewriteEmailInputSchema.parse(input);
  const prompt = buildRewriteEmailPrompt(parsed);
  // A rewrite may only reference URLs/emails already present in the source
  // email — there are no "facts" here, so the allow-list is empty and the
  // validator will reject anything not literally already in the original
  // text via the standard URL/email checks.
  return completeWithValidation(generator, prompt, []);
}

export { GeneratedEmailValidationError } from "./validator";
export type { AiEmailGenerator } from "./client";
