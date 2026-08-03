export {
  GENERATION_TYPES,
  REWRITE_STYLES,
  generateEmailInputSchema,
  rewriteEmailInputSchema,
  generatedEmailSchema,
  allowedFactSchema,
  priorEmailSchema,
  type GenerationType,
  type RewriteStyle,
  type AllowedFact,
  type PriorEmail,
  type GenerateEmailInput,
  type RewriteEmailInput,
  type GeneratedEmail,
} from "./types";
export {
  getAiEmailGenerator,
  isAiConfigured,
  AiNotConfiguredError,
  AiGenerationFailedError,
} from "./client";
export type { AiEmailGenerator } from "./client";
export { generateEmail, rewriteEmail, GeneratedEmailValidationError } from "./generate";
export { validateGeneratedEmail, assertValidGeneratedEmail } from "./validator";
export {
  buildGenerateEmailPrompt,
  buildRewriteEmailPrompt,
  buildReviewEmailPrompt,
  DEFAULT_GENERATION_SYSTEM_PROMPT,
  DEFAULT_REVIEW_SYSTEM_PROMPT,
  DEFAULT_REWRITE_SYSTEM_PROMPT,
} from "./prompt";
