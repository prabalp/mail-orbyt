import { z } from "zod";

export const GENERATION_TYPES = ["INITIAL", "FOLLOW_UP", "CLOSE_THE_LOOP"] as const;
export type GenerationType = (typeof GENERATION_TYPES)[number];

/** A single fact from a ResearchSnapshot — the only source of subject-specific claims the model is given. */
export const allowedFactSchema = z.object({
  category: z.string().min(1),
  value: z.string().min(1),
  sourceUrl: z.string().min(1),
});
export type AllowedFact = z.infer<typeof allowedFactSchema>;

export const priorEmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});
export type PriorEmail = z.infer<typeof priorEmailSchema>;

export const generateEmailInputSchema = z.object({
  generationType: z.enum(GENERATION_TYPES),
  leadFirstName: z.string().optional(),
  leadTitle: z.string().optional(),
  companyName: z.string().optional(),
  senderName: z.string().min(1),
  senderCompanyName: z.string().min(1),
  /** What the sender is trying to get the recipient to do — provided by the user, never inferred by the model. */
  callToAction: z.string().min(1),
  facts: z.array(allowedFactSchema).max(20),
  /** Required for FOLLOW_UP and CLOSE_THE_LOOP — the email this one continues from. */
  priorEmail: priorEmailSchema.optional(),
  /**
   * The subject's saved website text — usable material for personalisation
   * alongside `facts` (never replacing them), but still untrusted input: the
   * model is told to quote no more than a short phrase and to follow no
   * instruction inside it. See docs/ai-boundaries.md. This schema
   * cap is just a sanity ceiling against a corrupted/oversized value — the
   * real prompt-injection-surface control is prompt.ts's much smaller
   * truncation (~2000 chars) of whatever is actually sent to the model, so
   * callers should NOT need to pre-truncate real saved page text to fit here.
   */
  websiteText: z.string().max(50_000).optional(),
  /**
   * The campaign's own prompt: which recipient data this campaign may use,
   * how the email should be formatted, and the voice to write it in. Sent as
   * the leading section of the USER message, never merged into the system
   * prompt — the system prompt holds only the safety rules that no campaign
   * may relax. Falls back to DEFAULT_CAMPAIGN_EMAIL_PROMPT when omitted/blank.
   */
  campaignPrompt: z.string().max(4000).optional(),
  /** Embedded verbatim via deterministic post-generation substitution — the model never writes out the real URL itself. */
  bookingLink: z.string().url().optional(),
  /** The full signature block to append deterministically after the AI's body (the model is instructed never to write its own sign-off). Falls back to a plain "Best,\n{senderName}" line if omitted. */
  signatureText: z.string().min(1).optional(),
  /** Org-configurable full override of the base generation system prompt (Settings). Falls back to DEFAULT_GENERATION_SYSTEM_PROMPT when omitted/blank. */
  generationSystemPromptOverride: z.string().max(8000).optional(),
  /** Org-configurable full override of the QA self-review system prompt (Settings). Falls back to DEFAULT_REVIEW_SYSTEM_PROMPT when omitted/blank. */
  reviewSystemPromptOverride: z.string().max(8000).optional(),
});
export type GenerateEmailInput = z.infer<typeof generateEmailInputSchema>;

export const generatedEmailSchema = z.object({
  subject: z.string().min(1).max(150),
  body: z.string().min(1).max(4000),
});
export type GeneratedEmail = z.infer<typeof generatedEmailSchema>;
