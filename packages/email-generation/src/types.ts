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
