import type { AiSocialGenerator } from "./client";
import { buildSocialUserPrompt, DEFAULT_SOCIAL_GUARDRAIL_PROMPT } from "./prompt";
import {
  generateSocialContentInputSchema,
  type GenerateSocialContentInput,
  type GeneratedSocialContent,
} from "./types";

/**
 * Calls the AI client with the guardrail system prompt and the assembled
 * user prompt, and parses the structured output into
 * { content, modelSelfReportedConfidence, reasoning }.
 *
 * This module makes no deterministic safety decisions of its own — it just
 * runs the model. Every caller MUST run the result through
 * validator.ts's validateSocialContent before persisting, displaying, or
 * posting it; this function does not do that itself.
 */
export async function generateSocialContent(
  client: AiSocialGenerator,
  input: GenerateSocialContentInput,
): Promise<GeneratedSocialContent> {
  const parsed = generateSocialContentInputSchema.parse(input);
  const user = buildSocialUserPrompt(parsed);
  return client.complete({ system: DEFAULT_SOCIAL_GUARDRAIL_PROMPT, user });
}
