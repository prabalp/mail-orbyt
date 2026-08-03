import { z } from "zod";

export const GENERATION_TYPES = ["INITIAL", "FOLLOW_UP", "CLOSE_THE_LOOP"] as const;
export type GenerationType = (typeof GENERATION_TYPES)[number];

export const REWRITE_STYLES = ["SHORTER", "FORMAL", "DIRECT"] as const;
export type RewriteStyle = (typeof REWRITE_STYLES)[number];

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
   * The subject's saved website text — untrusted, context-only (tone/topic
   * familiarity), never a source of new factual claims. Added alongside
   * `facts`, never replacing them. See docs/ai-boundaries.md. This schema
   * cap is just a sanity ceiling against a corrupted/oversized value — the
   * real prompt-injection-surface control is prompt.ts's much smaller
   * truncation (~2000 chars) of whatever is actually sent to the model, so
   * callers should NOT need to pre-truncate real saved page text to fit here.
   */
  websiteText: z.string().max(50_000).optional(),
  /** Organisation-configured tone/style guidance, appended to (never replacing) the fixed core system prompt. */
  customInstructions: z.string().max(2000).optional(),
  /** Embedded verbatim via deterministic post-generation substitution — the model never writes out the real URL itself. */
  bookingLink: z.string().url().optional(),
  /** The full signature block to append deterministically after the AI's body (the model is instructed never to write its own sign-off). Falls back to a plain "Best,\n{senderName}" line if omitted. */
  signatureText: z.string().min(1).optional(),
});
export type GenerateEmailInput = z.infer<typeof generateEmailInputSchema>;

export const rewriteEmailInputSchema = z.object({
  style: z.enum(REWRITE_STYLES),
  subject: z.string().min(1),
  body: z.string().min(1),
});
export type RewriteEmailInput = z.infer<typeof rewriteEmailInputSchema>;

export const generatedEmailSchema = z.object({
  subject: z.string().min(1).max(150),
  body: z.string().min(1).max(4000),
});
export type GeneratedEmail = z.infer<typeof generatedEmailSchema>;
