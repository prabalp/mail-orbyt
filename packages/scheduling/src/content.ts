import {
  generateEmail,
  type AiEmailGenerator,
  type GenerateEmailInput,
} from "@mail-orbyt/email-generation";
import { createResearchSnapshot } from "@mail-orbyt/research";
import type { Lead, PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "researchFact" | "researchSnapshot">;

export class AiNotConfiguredForStepError extends Error {
  constructor() {
    super("This step is set to use AI generation, but no AI provider is configured.");
    this.name = "AiNotConfiguredForStepError";
  }
}

function applyMergeTokens(
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

  const snapshot = await createResearchSnapshot(prisma, {
    organisationId: params.organisationId,
    subjectType: "LEAD",
    leadId: params.lead.id,
  });
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
  });
}
