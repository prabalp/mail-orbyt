import { z } from "zod";

export const SOCIAL_PLATFORM_NAMES = [
  "LINKEDIN",
  "TWITTER",
  "REDDIT",
  "INSTAGRAM",
  "THREADS",
] as const;
export type SocialPlatformName = (typeof SOCIAL_PLATFORM_NAMES)[number];

export const SOCIAL_ACTION_KINDS = ["POST", "REPLY", "DM_REPLY"] as const;
export type SocialActionKind = (typeof SOCIAL_ACTION_KINDS)[number];

export const generateSocialContentInputSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORM_NAMES),
  actionKind: z.enum(SOCIAL_ACTION_KINDS),
  /** The inbound mention/comment/DM text being replied to; absent for a proactive POST. */
  triggerContentText: z.string().max(10_000).optional(),
  /** Org's configured voice/brand instructions, analogous to Campaign.emailPromptInstructions. */
  voiceInstructions: z.string().max(4000).optional(),
  /** Recent org posts/replies for style continuity, optional. */
  recentContext: z.array(z.string().max(2000)).max(10).optional(),
});
export type GenerateSocialContentInput = z.infer<typeof generateSocialContentInputSchema>;

export const generatedSocialContentSchema = z.object({
  content: z.string().min(1),
  /** Model's own self-reported confidence, 0-1, BEFORE validator adjustment. Do not trust this alone. */
  modelSelfReportedConfidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});
export type GeneratedSocialContent = z.infer<typeof generatedSocialContentSchema>;

export interface SocialContentValidationResult {
  valid: boolean;
  /** Content after deterministic auto-fixes (e.g. trimming to platform length limit). Same content if no fix was needed. */
  fixedContent: string;
  requiredAutoFix: boolean;
  /** Human-readable reasons — populated whenever valid=false, and may also be populated on a passing (valid=true) result for non-rejecting flags such as a prior-escalation-phrase match. */
  violations: string[];
}
