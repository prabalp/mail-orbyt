import {
  generateEmail,
  type AiEmailGenerator,
  type GenerateEmailInput,
} from "@mail-orbyt/email-generation";
import { parseJourneyGraph, renderJourneyTemplate } from "@mail-orbyt/leads";
import { createResearchSnapshot, getLatestPageText } from "@mail-orbyt/research";
import type { Lead, PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<
  PrismaClient,
  "researchFact" | "researchSnapshot" | "researchSource" | "researchPageText" | "leadImportedEmail"
>;

export class AiNotConfiguredForStepError extends Error {
  constructor() {
    super("This step is set to use AI generation, but no AI provider is configured.");
    this.name = "AiNotConfiguredForStepError";
  }
}

export class MissingImportedEmailError extends Error {
  constructor(sequence: number) {
    super(
      `This lead has no imported email for sequence ${sequence}. Import it, or switch the step off imported emails.`,
    );
    this.name = "MissingImportedEmailError";
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
  lead: Pick<Lead, "id" | "firstName" | "lastName" | "title"> &
    Partial<
      Pick<Lead, "email" | "industry" | "city" | "state" | "country" | "websiteUrl" | "linkedinUrl">
    > & { company?: { name: string } | null };
  step: {
    orderIndex?: number;
    stepType: GenerateEmailInput["generationType"];
    useAiGeneration: boolean;
    useImportedContent?: boolean;
    callToActionOverride: string | null;
    stepInstructions: string | null;
    manualSubject: string | null;
    manualBody: string | null;
  };
  /** Journey sends: the graph node whose imported email to send, instead of the step's sequence number. */
  nodeKey?: string;
  /** Campaign.journeyGraph — when it holds this node, its template and variable mapping are used. */
  journeyGraph?: unknown;
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

function renderImportedEmail(
  lead: MaterializeContentParams["lead"],
  email: { subject: string; body: string },
  senderName: string,
  signatureText: string | undefined,
): { subject: string; body: string } {
  const name = lead.firstName?.trim() || "there";
  const signature = (signatureText ?? "Best,\n{senderName}").replace(/\{senderName\}/g, senderName);
  return {
    subject: applyMergeTokens(email.subject, lead),
    body: `Hey ${name},\n\n${applyMergeTokens(email.body, lead)}\n\n${signature}`,
  };
}

/** The node's subject/body with the campaign's variable mapping already applied for this lead; null if the campaign has no such node. */
async function journeyGraphNode(
  prisma: Prisma,
  params: MaterializeContentParams,
): Promise<{ subject: string; body: string } | null> {
  const parsed = parseJourneyGraph(params.journeyGraph);
  if (!parsed.ok) return null;
  const graphNode = parsed.graph.nodes.find((candidate) => candidate.key === params.nodeKey);
  if (!graphNode) return null;
  // "Use uploaded email #N": the text comes from the lead's own import, and
  // still goes through the campaign's variable mapping.
  let node = graphNode;
  if (graphNode.importedSequence) {
    const imported = await prisma.leadImportedEmail.findUnique({
      where: {
        leadId_sequence: { leadId: params.lead.id, sequence: graphNode.importedSequence },
      },
    });
    if (!imported) throw new MissingImportedEmailError(graphNode.importedSequence);
    node = { ...graphNode, subject: imported.subject, body: imported.body };
  }
  const { lead } = params;
  const values = {
    firstName: lead.firstName,
    lastName: lead.lastName,
    title: lead.title,
    email: lead.email,
    industry: lead.industry,
    city: lead.city,
    state: lead.state,
    country: lead.country,
    websiteUrl: lead.websiteUrl,
    linkedinUrl: lead.linkedinUrl,
    company: lead.company?.name,
  };
  return {
    subject: renderJourneyTemplate(node.subject, parsed.graph.variables, values),
    body: renderJourneyTemplate(node.body, parsed.graph.variables, values),
  };
}

/** Produces the subject/body for a step's send — either a manual template with {{firstName}}-style merge tokens, or an AI-generated email built from the lead's current research snapshot. Never both. */
export async function materializeStepContent(prisma: Prisma, params: MaterializeContentParams) {
  const graphNode =
    params.nodeKey && params.journeyGraph ? await journeyGraphNode(prisma, params) : null;
  if (graphNode) {
    return renderImportedEmail(params.lead, graphNode, params.senderName, params.signatureText);
  }

  if (params.step.useImportedContent) {
    const sequence = (params.step.orderIndex ?? 0) + 1;
    const imported = params.nodeKey
      ? await prisma.leadImportedEmail.findUnique({
          where: { leadId_nodeKey: { leadId: params.lead.id, nodeKey: params.nodeKey } },
        })
      : await prisma.leadImportedEmail.findUnique({
          where: { leadId_sequence: { leadId: params.lead.id, sequence } },
        });
    if (!imported) throw new MissingImportedEmailError(sequence);
    return renderImportedEmail(params.lead, imported, params.senderName, params.signatureText);
  }

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
    stepInstructions: params.step.stepInstructions ?? undefined,
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
