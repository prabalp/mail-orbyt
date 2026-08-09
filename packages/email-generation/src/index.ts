export {
  GENERATION_TYPES,
  generateEmailInputSchema,
  generatedEmailSchema,
  allowedFactSchema,
  priorEmailSchema,
  type GenerationType,
  type AllowedFact,
  type PriorEmail,
  type GenerateEmailInput,
  type GeneratedEmail,
} from "./types";
export {
  getAiEmailGenerator,
  isAiConfigured,
  getEnvironmentAiDefaults,
  verifyAiCredentials,
  AiNotConfiguredError,
  AiGenerationFailedError,
} from "./client";
export type { AiEmailGenerator, AiConfigOverride } from "./client";
export { generateEmail, GeneratedEmailValidationError } from "./generate";
export { validateGeneratedEmail, assertValidGeneratedEmail } from "./validator";
export {
  buildGenerateEmailPrompt,
  buildReviewEmailPrompt,
  DEFAULT_GENERATION_SYSTEM_PROMPT,
  DEFAULT_REVIEW_SYSTEM_PROMPT,
  DEFAULT_CAMPAIGN_EMAIL_PROMPT,
} from "./prompt";
