import {
  generateEmail,
  type AiEmailGenerator,
  type GenerateEmailInput,
} from "@mail-orbyt/email-generation";
import { createResearchSnapshot, getLatestPageText } from "@mail-orbyt/research";
import type { Lead, PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<
  PrismaClient,
  "researchFact" | "researchSnapshot" | "researchSource" | "researchPageText"
>;

export class AiNotConfiguredForStepError extends Error {
  constructor() {
    super("This step is set to use AI generation, but no AI provider is configured.");
    this.name = "AiNotConfiguredForStepError";
  }
}

/** Exported for reuse by test-send (apps/web/src/lib/campaigns.ts), which materializes a manual step's content for a synthetic sample recipient without a real Lead row to attach a research snapshot to. */
export function applyMergeTokens(
  template: string,
  lead: Pick<Lead, "firstName" | "lastName" | "title">,
): string {
  return template
    .replace(/\{\{\s*firstName\s*\}\}/gi, lead.firstName ?? "there")
    .replace(/\{\{\s*lastName\s*\}\}/gi, lead.lastName ?? "")
    .replace(/\{\{\s*title\s*\}\}/gi, lead.title ?? "");
}

export interface MaterializeContentParams {
  organisationId: string;
  lead: Pick<Lead, "id" | "firstName" | "lastName" | "title">;
  step: {
    stepType: GenerateEmailInput["generationType"];
    useAiGeneration: boolean;
    callToActionOverride: string | null;
    manualSubject: string | null;
    manualBody: string | null;
  };
  senderName: string;
  senderCompanyName: string;
  priorEmail?: { subject: string; body: string };
  aiGenerator: AiEmailGenerator | undefined;
  /** The campaign's own prompt (recipient data it may use, format, voice) — see packages/email-generation's DEFAULT_CAMPAIGN_EMAIL_PROMPT. */
  campaignPrompt?: string;
  bookingLink?: string;
  /** The sending inbox's configured default signature, if any — see resolveDefaultSignatureText in @mail-orbyt/gmail. Falls back to a plain "Best,\n{senderName}" line when omitted. */
  signatureText?: string;
  /** Org-configurable full overrides of the generation/review system prompts (Settings) — see @mail-orbyt/email-generation's DEFAULT_GENERATION_SYSTEM_PROMPT/DEFAULT_REVIEW_SYSTEM_PROMPT. */
  generationSystemPromptOverride?: string;
  reviewSystemPromptOverride?: string;
}

/** Produces the subject/body for a step's send — either a manual template with {{firstName}}-style merge tokens, or an AI-generated email built from the lead's current research snapshot. Never both. */
export async function materializeStepContent(prisma: Prisma, params: MaterializeContentParams) {
  if (!params.step.useAiGeneration) {
    if (!params.step.manualSubject || !params.step.manualBody) {
      throw new Error(
        "Manual step is missing subject/body — this should have been rejected at creation.",
      );
    }
    return {
      subject: applyMergeTokens(params.step.manualSubject, params.lead),
      body: applyMergeTokens(params.step.manualBody, params.lead),
    };
  }

  if (!params.aiGenerator) {
    throw new AiNotConfiguredForStepError();
  }

  const [snapshot, pageText] = await Promise.all([
    createResearchSnapshot(prisma, {
      organisationId: params.organisationId,
      subjectType: "LEAD",
      leadId: params.lead.id,
    }),
    getLatestPageText(prisma, {
      organisationId: params.organisationId,
      subjectType: "LEAD",
      leadId: params.lead.id,
    }),
  ]);
  const facts = snapshot.facts as { category: string; value: string; sourceUrl: string }[];

  return generateEmail(params.aiGenerator, {
    generationType: params.step.stepType,
    leadFirstName: params.lead.firstName ?? undefined,
    leadTitle: params.lead.title ?? undefined,
    senderName: params.senderName,
    senderCompanyName: params.senderCompanyName,
    callToAction:
      params.step.callToActionOverride ?? "connect and learn more about your priorities",
    facts,
    priorEmail: params.priorEmail,
    websiteText: pageText?.text,
    campaignPrompt: params.campaignPrompt,
    bookingLink: params.bookingLink,
    signatureText: params.signatureText,
    generationSystemPromptOverride: params.generationSystemPromptOverride,
    reviewSystemPromptOverride: params.reviewSystemPromptOverride,
  });
}
