import {
  AiNotConfiguredError,
  generateEmail,
  getAiEmailGenerator,
  isAiConfigured,
  type GenerationType,
} from "@mail-orbyt/email-generation";
import { resolveOrgAiConfig } from "@mail-orbyt/ai-settings";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { resolveInboxSenderName } from "@mail-orbyt/gmail";
import { createResearchSnapshot, getLatestPageText } from "@mail-orbyt/research";

const env = loadEnv();

export { AiNotConfiguredError };

/**
 * Whether this organisation can generate at all — its own saved provider key
 * counts, not just the deployment's. Async because the organisation's key
 * lives in the database, unlike the environment-only check it replaced.
 */
export async function isAiConfiguredForOrganisation(organisationId: string): Promise<boolean> {
  return isAiConfigured(await resolveOrgAiConfig(prisma, organisationId));
}

export interface GenerateDraftParams {
  organisationId: string;
  leadId: string;
  generationType: GenerationType;
  callToAction: string;
  createdByUserId: string;
  /** Required for FOLLOW_UP/CLOSE_THE_LOOP — the draft this one continues from. */
  basedOnDraftId?: string;
}

/**
 * The sender identity for a one-off draft. Name comes from the
 * organisation's first connected inbox (the same identity that would
 * actually send the email), not the user who clicked "generate" — falling
 * back to that user's name only if no inbox is connected yet.
 */
async function loadSenderContext(organisationId: string, createdByUserId: string) {
  const [organisation, user, inbox] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisationId } }),
    prisma.user.findUniqueOrThrow({ where: { id: createdByUserId } }),
    prisma.inbox.findFirst({
      where: { organisationId, status: "CONNECTED" },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    senderCompanyName: organisation.name,
    senderName: inbox ? resolveInboxSenderName(inbox) : (user.name ?? user.email),
    campaignPrompt: organisation.emailPromptInstructions ?? undefined,
    bookingLink: organisation.calendlyUrl ?? undefined,
    generationSystemPromptOverride: organisation.generationSystemPrompt ?? undefined,
    reviewSystemPromptOverride: organisation.reviewSystemPrompt ?? undefined,
  };
}

export async function generateDraft(params: GenerateDraftParams) {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: params.leadId },
    include: { company: true },
  });
  if (lead.organisationId !== params.organisationId) {
    throw new Error("Lead does not belong to this organisation.");
  }

  let priorEmail: { subject: string; body: string } | undefined;
  if (params.generationType !== "INITIAL") {
    if (!params.basedOnDraftId) {
      throw new Error(`${params.generationType} requires basedOnDraftId.`);
    }
    const basedOn = await prisma.emailDraft.findUniqueOrThrow({
      where: { id: params.basedOnDraftId },
    });
    if (basedOn.organisationId !== params.organisationId || basedOn.leadId !== params.leadId) {
      throw new Error("basedOnDraftId does not belong to this lead.");
    }
    priorEmail = { subject: basedOn.subject, body: basedOn.body };
  }

  const [
    snapshot,
    pageText,
    {
      senderCompanyName,
      senderName,
      campaignPrompt,
      bookingLink,
      generationSystemPromptOverride,
      reviewSystemPromptOverride,
    },
    aiConfig,
  ] = await Promise.all([
    createResearchSnapshot(prisma, {
      organisationId: params.organisationId,
      subjectType: "LEAD",
      leadId: params.leadId,
    }),
    getLatestPageText(prisma, {
      organisationId: params.organisationId,
      subjectType: "LEAD",
      leadId: params.leadId,
    }),
    loadSenderContext(params.organisationId, params.createdByUserId),
    resolveOrgAiConfig(prisma, params.organisationId),
  ]);
  const facts = snapshot.facts as { category: string; value: string; sourceUrl: string }[];

  const generator = getAiEmailGenerator(aiConfig);
  const generated = await generateEmail(generator, {
    generationType: params.generationType,
    leadFirstName: lead.firstName ?? undefined,
    leadTitle: lead.title ?? undefined,
    companyName: lead.company?.name,
    senderName,
    senderCompanyName,
    callToAction: params.callToAction,
    facts,
    priorEmail,
    websiteText: pageText?.text,
    campaignPrompt,
    bookingLink,
    generationSystemPromptOverride,
    reviewSystemPromptOverride,
  });

  return prisma.emailDraft.create({
    data: {
      organisationId: params.organisationId,
      leadId: params.leadId,
      generationType: params.generationType,
      basedOnDraftId: params.basedOnDraftId,
      researchSnapshotId: snapshot.id,
      subject: generated.subject,
      body: generated.body,
      modelUsed: env.AI_PROVIDER_MODEL,
      createdByUserId: params.createdByUserId,
    },
  });
}

export async function listDrafts(organisationId: string, leadId: string) {
  return prisma.emailDraft.findMany({
    where: { organisationId, leadId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Removes a draft outright. The drafts panel is a preview surface — you
 * generate a few, see how they read, and throw the rest away — so an unwanted
 * draft is deleted rather than parked in a DISCARDED state that keeps
 * cluttering the list until the retention sweep runs.
 *
 * Safe for drafts that follow-ups were generated from: EmailDraft's
 * self-relation is ON DELETE SET NULL, so a derived draft survives and simply
 * loses its `basedOnDraftId` pointer.
 */
export async function deleteDraft(organisationId: string, draftId: string) {
  const draft = await prisma.emailDraft.findUniqueOrThrow({ where: { id: draftId } });
  if (draft.organisationId !== organisationId) {
    throw new Error("Draft does not belong to this organisation.");
  }
  await prisma.emailDraft.delete({ where: { id: draftId } });
}

export async function setDraftStatus(
  organisationId: string,
  draftId: string,
  status: "APPROVED" | "DISCARDED",
) {
  const draft = await prisma.emailDraft.findUniqueOrThrow({ where: { id: draftId } });
  if (draft.organisationId !== organisationId) {
    throw new Error("Draft does not belong to this organisation.");
  }
  return prisma.emailDraft.update({ where: { id: draftId }, data: { status } });
}
