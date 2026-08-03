import {
  AiNotConfiguredError,
  generateEmail,
  getAiEmailGenerator,
  isAiConfigured,
  rewriteEmail,
  type GenerationType,
  type RewriteStyle,
} from "@mail-orbyt/email-generation";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { resolveInboxSenderName } from "@mail-orbyt/gmail";
import { createResearchSnapshot, getLatestPageText } from "@mail-orbyt/research";

const env = loadEnv();

export { isAiConfigured, AiNotConfiguredError };

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
    customInstructions: organisation.emailPromptInstructions ?? undefined,
    bookingLink: organisation.calendlyUrl ?? undefined,
    generationSystemPromptOverride: organisation.generationSystemPrompt ?? undefined,
    reviewSystemPromptOverride: organisation.reviewSystemPrompt ?? undefined,
    rewriteSystemPromptOverride: organisation.rewriteSystemPrompt ?? undefined,
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
      customInstructions,
      bookingLink,
      generationSystemPromptOverride,
      reviewSystemPromptOverride,
    },
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
    ]);
  const facts = snapshot.facts as { category: string; value: string; sourceUrl: string }[];

  const generator = getAiEmailGenerator();
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
    customInstructions,
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

export interface RewriteDraftParams {
  organisationId: string;
  draftId: string;
  style: RewriteStyle;
  createdByUserId: string;
}

export async function rewriteDraft(params: RewriteDraftParams) {
  const original = await prisma.emailDraft.findUniqueOrThrow({ where: { id: params.draftId } });
  if (original.organisationId !== params.organisationId) {
    throw new Error("Draft does not belong to this organisation.");
  }

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: params.organisationId },
  });

  const generator = getAiEmailGenerator();
  const rewritten = await rewriteEmail(generator, {
    style: params.style,
    subject: original.subject,
    body: original.body,
    rewriteSystemPromptOverride: organisation.rewriteSystemPrompt ?? undefined,
  });

  return prisma.emailDraft.create({
    data: {
      organisationId: params.organisationId,
      leadId: original.leadId,
      generationType: original.generationType,
      rewriteStyle: params.style,
      basedOnDraftId: original.id,
      researchSnapshotId: original.researchSnapshotId,
      subject: rewritten.subject,
      body: rewritten.body,
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
