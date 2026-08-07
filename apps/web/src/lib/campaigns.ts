import {
  addStep,
  archiveCampaign,
  CampaignActivationError,
  createCampaign,
  enrollLeads,
  enrollLeadsFromList,
  exitEnrollment,
  getCampaign,
  listCampaigns,
  listEnrollments,
  removeStep,
  reorderSteps,
  setCampaignInboxes,
  updateCampaign,
  updateStep,
  type AddStepParams,
  type CreateCampaignParams,
  type UpdateCampaignParams,
} from "@mail-orbyt/campaigns";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { generateEmail, getAiEmailGenerator, isAiConfigured } from "@mail-orbyt/email-generation";
import { resolveDefaultSignatureText, resolveInboxSenderName, sendFromInbox } from "@mail-orbyt/gmail";
import { applyMergeTokens, enqueueDueOutboxItems, processOutboxItem } from "@mail-orbyt/scheduling";

export {
  CampaignActivationError,
  InvalidStepError,
  InvalidInboxPoolError,
} from "@mail-orbyt/campaigns";

export async function createOrganisationCampaign(params: CreateCampaignParams) {
  return createCampaign(prisma, params);
}

export async function listOrganisationCampaigns(organisationId: string) {
  return listCampaigns(prisma, organisationId);
}

export async function getOrganisationCampaign(organisationId: string, campaignId: string) {
  return getCampaign(prisma, organisationId, campaignId);
}

export async function updateOrganisationCampaign(
  organisationId: string,
  campaignId: string,
  patch: UpdateCampaignParams,
) {
  return updateCampaign(prisma, organisationId, campaignId, patch);
}

export async function archiveOrganisationCampaign(organisationId: string, campaignId: string) {
  return archiveCampaign(prisma, organisationId, campaignId);
}

export async function addCampaignStep(
  organisationId: string,
  campaignId: string,
  params: AddStepParams,
) {
  return addStep(prisma, organisationId, campaignId, params);
}

export async function updateCampaignStep(
  organisationId: string,
  campaignId: string,
  stepId: string,
  patch: Partial<AddStepParams>,
) {
  return updateStep(prisma, organisationId, campaignId, stepId, patch);
}

export async function removeCampaignStep(
  organisationId: string,
  campaignId: string,
  stepId: string,
) {
  return removeStep(prisma, organisationId, campaignId, stepId);
}

export async function reorderCampaignSteps(
  organisationId: string,
  campaignId: string,
  orderedStepIds: string[],
) {
  return reorderSteps(prisma, organisationId, campaignId, orderedStepIds);
}

export async function setCampaignInboxPool(
  organisationId: string,
  campaignId: string,
  inboxIds: string[],
) {
  return setCampaignInboxes(prisma, organisationId, campaignId, inboxIds);
}

export async function enrollCampaignLeads(
  organisationId: string,
  campaignId: string,
  leadIds: string[],
) {
  return enrollLeads(prisma, organisationId, campaignId, leadIds);
}

export async function enrollCampaignLeadsFromList(
  organisationId: string,
  campaignId: string,
  leadListId: string,
) {
  return enrollLeadsFromList(prisma, organisationId, campaignId, leadListId);
}

export async function listCampaignEnrollments(organisationId: string, campaignId: string) {
  return listEnrollments(prisma, organisationId, campaignId);
}

export async function exitCampaignEnrollment(
  organisationId: string,
  campaignId: string,
  leadId: string,
  reason?: string,
) {
  return exitEnrollment(prisma, organisationId, campaignId, leadId, reason);
}

async function getSenderContext(organisationId: string) {
  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisationId },
  });
  return {
    senderName: organisation.name,
    senderCompanyName: organisation.name,
    customInstructions: organisation.emailPromptInstructions ?? undefined,
    bookingLink: organisation.calendlyUrl ?? undefined,
    generationSystemPromptOverride: organisation.generationSystemPrompt ?? undefined,
    reviewSystemPromptOverride: organisation.reviewSystemPrompt ?? undefined,
  };
}

/**
 * Dev-only test helper: sends this campaign's due outbox items right now,
 * synchronously, bypassing the 60s scheduler tick and BullMQ entirely. Mirrors
 * the deps wiring in apps/worker/src/queues/outbox.ts so behavior matches
 * production sending. Never call this in production — see the NODE_ENV
 * guard in the send-now route.
 */
export async function sendCampaignNow(organisationId: string, campaignId: string) {
  const env = loadEnv();

  await enqueueDueOutboxItems(prisma);

  const dueItems = await prisma.outboxItem.findMany({
    where: { campaignId, organisationId, status: "SCHEDULED" },
    select: { id: true, enrollmentId: true },
  });

  const results = [];
  for (const item of dueItems) {
    const processed = await processOutboxItem(
      prisma,
      {
        aiGenerator: isAiConfigured() ? getAiEmailGenerator() : undefined,
        sendEmail: (inboxId, message) => sendFromInbox(prisma, inboxId, message),
        getSenderContext,
        emergencyStop: env.EMERGENCY_STOP,
      },
      item.id,
    );
    results.push(processed);
  }

  return {
    considered: dueItems.length,
    sent: results.filter((r) => r?.status === "SENT").length,
    failed: results.filter((r) => r?.status === "FAILED").length,
    skipped: results.filter((r) => r?.status?.startsWith("SKIPPED")).length,
    // Still SCHEDULED after processing: waiting on the campaign's per-inbox
    // cooldown (or an exhausted pool). Reported explicitly because otherwise
    // these items appear in `considered` and nowhere else, which reads like
    // sends vanishing rather than the throttle doing its job.
    deferred: results.filter((r) => r?.status === "SCHEDULED").length,
  };
}

/** A generic placeholder recipient for test sends — no real Lead row exists to attach a research snapshot to, so AI generation runs with an empty fact list (the model writes a generic-but-relevant email per prompt rule 2). */
const SAMPLE_RECIPIENT = { firstName: null, lastName: null, title: null };

/**
 * Sends the campaign's first step to 1-2 user-supplied addresses, exactly as
 * it would go out to a real prospect, so the sender can visually confirm
 * formatting/signature/tone before (or after) the campaign goes live. Unlike
 * sendCampaignNow, this is always available (not a dev-only shortcut) and
 * never creates OutboxItem/CampaignEnrollment rows — it never touches real
 * campaign progress or prospect data.
 */
export async function sendTestEmail(organisationId: string, campaignId: string, emails: string[]) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      steps: { orderBy: { orderIndex: "asc" }, take: 1 },
      inboxes: { include: { inbox: true } },
    },
  });
  if (!campaign || campaign.organisationId !== organisationId) return null;

  const step = campaign.steps[0];
  if (!step) {
    throw new CampaignActivationError("Add at least one step before sending a test email.");
  }
  const inbox = campaign.inboxes.find((entry) => entry.inbox.status === "CONNECTED")?.inbox;
  if (!inbox) {
    throw new CampaignActivationError(
      "Connect at least one inbox to this campaign before sending a test email.",
    );
  }

  let subject: string;
  let body: string;

  if (!step.useAiGeneration) {
    if (!step.manualSubject || !step.manualBody) {
      throw new Error("Manual step is missing subject/body.");
    }
    subject = applyMergeTokens(step.manualSubject, SAMPLE_RECIPIENT);
    body = applyMergeTokens(step.manualBody, SAMPLE_RECIPIENT);
  } else {
    if (!isAiConfigured()) {
      throw new Error("This step uses AI generation, but no AI provider is configured.");
    }
    const [
      { senderCompanyName, customInstructions, bookingLink, generationSystemPromptOverride, reviewSystemPromptOverride },
      signatureText,
    ] = await Promise.all([
      getSenderContext(organisationId),
      resolveDefaultSignatureText(prisma, inbox.id),
    ]);
    const generated = await generateEmail(getAiEmailGenerator(), {
      generationType: step.stepType,
      senderName: resolveInboxSenderName(inbox),
      senderCompanyName,
      callToAction: step.callToActionOverride ?? "connect and learn more about your priorities",
      facts: [],
      signatureText,
      customInstructions,
      bookingLink,
      generationSystemPromptOverride,
      reviewSystemPromptOverride,
    });
    subject = generated.subject;
    body = generated.body;
  }

  const results = await Promise.all(
    emails.map(async (to) => {
      try {
        await sendFromInbox(prisma, inbox.id, { to, subject, body });
        return { email: to, ok: true };
      } catch (error) {
        return { email: to, ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  return { subject, body, results };
}
