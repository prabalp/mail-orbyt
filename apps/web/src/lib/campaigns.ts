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
  listCampaignExclusions,
  addCampaignExclusions,
  removeCampaignExclusion,
  removeStep,
  reorderSteps,
  setCampaignInboxes,
  updateCampaign,
  updateStep,
  type AddStepParams,
  type CreateCampaignParams,
  type UpdateCampaignParams,
} from "@mail-orbyt/campaigns";
import { resolveOrgAiConfig } from "@mail-orbyt/ai-settings";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { generateEmail, getAiEmailGenerator, isAiConfigured } from "@mail-orbyt/email-generation";
import {
  resolveDefaultSignatureText,
  resolveInboxSenderName,
  sendFromInbox,
} from "@mail-orbyt/gmail";
import {
  applyCalendlyLink,
  createUnsubscribeLinker,
  applyMergeTokens,
  BookingLinkNotConfiguredError,
  dispatchDueOutboxItems,
  enqueueDueOutboxItems,
  materializeStepContent,
  MissingImportedEmailError,
  processOutboxItem,
} from "@mail-orbyt/scheduling";
import { parseJourneyGraph, renderJourneyTemplate } from "@mail-orbyt/leads";
import { redisConnection } from "@/lib/queue";

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
  actor?: { userId?: string },
) {
  const campaign = await updateCampaign(prisma, organisationId, campaignId, patch, actor);

  // Activating is otherwise only a column write, and sending is driven by the
  // worker's 60s tick — so without this a campaign switched back to Active sits
  // there with its emails "queued" for up to a minute, which reads as the
  // resume not having worked. Both calls are idempotent, so the tick that
  // follows re-covers the same items without sending anything twice.
  if (campaign?.status === "ACTIVE" && patch.status === "ACTIVE") {
    await enqueueDueOutboxItems(prisma, { campaignId });
    await dispatchDueOutboxItems(prisma, redisConnection, { campaignId });
  }

  return campaign;
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
    campaignPrompt: organisation.emailPromptInstructions ?? undefined,
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
        resolveAiGenerator: async (itemOrganisationId) => {
          const aiConfig = await resolveOrgAiConfig(prisma, itemOrganisationId);
          return isAiConfigured(aiConfig) ? getAiEmailGenerator(aiConfig) : undefined;
        },
        sendEmail: (inboxId, message) => sendFromInbox(prisma, inboxId, message),
        getSenderContext,
        unsubscribeLinks: createUnsubscribeLinker({ appUrl: env.APP_URL, secret: env.AUTH_SECRET }),
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

/** Sample values for previewing a journey email, so variables read naturally instead of blank. */
const SAMPLE_LEAD_VALUES = {
  firstName: "Jamie",
  lastName: "Rivera",
  title: "CTO",
  company: "Acme",
  industry: "Software",
  email: "jamie@example.com",
};

/** Fisher-Yates shuffle (copy) so each test send previews a different lead. */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * Renders the real email one randomly chosen, still-contactable enrolled lead
 * would receive for this step, going through the exact production rendering
 * path (greeting, merge tokens, Calendly link, signature). Used by test sends
 * for campaigns whose content is imported per lead.
 */
async function renderRandomLeadEmail(params: {
  organisationId: string;
  campaign: { id: string; journeyGraph: unknown };
  step: Parameters<typeof materializeStepContent>[1]["step"];
  inbox: Parameters<typeof resolveInboxSenderName>[0];
  nodeKey?: string;
}) {
  const [{ senderCompanyName, bookingLink }, signatureText, enrollments, excluded] =
    await Promise.all([
      getSenderContext(params.organisationId),
      resolveDefaultSignatureText(prisma, params.organisationId),
      prisma.campaignEnrollment.findMany({
        where: {
          campaignId: params.campaign.id,
          status: { in: ["PENDING", "ACTIVE", "PAUSED"] },
          lead: { email: { not: null } },
        },
        select: { leadId: true },
      }),
      prisma.campaignExclusion.findMany({
        where: { campaignId: params.campaign.id },
        select: { email: true },
      }),
    ]);
  const excludedEmails = new Set(excluded.map((entry) => entry.email));

  for (const { leadId } of shuffled(enrollments).slice(0, 25)) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { company: true },
    });
    if (!lead?.email || excludedEmails.has(lead.email.trim().toLowerCase())) continue;
    try {
      const rendered = await materializeStepContent(prisma, {
        organisationId: params.organisationId,
        lead,
        step: params.step,
        nodeKey: params.nodeKey,
        journeyGraph: params.campaign.journeyGraph,
        senderName: resolveInboxSenderName(params.inbox),
        senderCompanyName,
        aiGenerator: undefined,
        bookingLink,
        signatureText,
      });
      return {
        ...rendered,
        previewedLead: {
          name: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "(no name)",
          company: lead.company?.name ?? null,
        },
      };
    } catch (error) {
      if (error instanceof MissingImportedEmailError) continue;
      if (error instanceof BookingLinkNotConfiguredError) {
        throw new CampaignActivationError(error.message);
      }
      throw error;
    }
  }
  throw new CampaignActivationError(
    "No enrolled lead has an imported email for this step yet, so there is nothing to test with.",
  );
}

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

  // A test must never reach a real prospect: refuse any address that belongs
  // to a lead enrolled in this campaign (the "list" being tested against).
  const enrolledMatch = await prisma.lead.findFirst({
    where: {
      organisationId,
      email: { in: emails, mode: "insensitive" },
      campaignEnrollments: { some: { campaignId } },
    },
    select: { email: true },
  });
  if (enrolledMatch) {
    throw new CampaignActivationError(
      `${enrolledMatch.email} is a lead in this campaign. Use an address that is not on the campaign's list for test sends.`,
    );
  }

  let subject: string;
  let body: string;
  let previewedLead: { name: string; company: string | null } | undefined;

  const journeyStart =
    campaign.routingMode === "JOURNEY" && campaign.journeyGraph
      ? parseJourneyGraph(campaign.journeyGraph)
      : null;
  const journeyStartNode =
    journeyStart?.ok === true
      ? journeyStart.graph.nodes.find((node) => node.key === journeyStart.graph.start)
      : undefined;
  const usesImportedContent =
    campaign.routingMode === "JOURNEY"
      ? Boolean(journeyStartNode?.importedSequence)
      : step.useImportedContent;

  if (usesImportedContent) {
    // Imported emails differ per lead, so a test send picks one random enrolled
    // lead and sends that lead's real email (fully rendered) to the test address.
    const rendered = await renderRandomLeadEmail({
      organisationId,
      campaign,
      step,
      inbox,
      nodeKey: journeyStartNode?.key,
    });
    subject = rendered.subject;
    body = rendered.body;
    previewedLead = rendered.previewedLead;
  } else if (campaign.routingMode === "JOURNEY") {
    // Preview the journey's starting email with a sample lead; the greeting is
    // not added here, matching how manual steps are test-sent.
    const parsed = campaign.journeyGraph ? parseJourneyGraph(campaign.journeyGraph) : null;
    if (!parsed?.ok) {
      throw new CampaignActivationError("Build and save the journey before sending a test email.");
    }
    const startNode = parsed.graph.nodes.find((node) => node.key === parsed.graph.start);
    if (!startNode) {
      throw new CampaignActivationError("Build and save the journey before sending a test email.");
    }
    subject = renderJourneyTemplate(startNode.subject, parsed.graph.variables, SAMPLE_LEAD_VALUES);
    body = renderJourneyTemplate(startNode.body, parsed.graph.variables, SAMPLE_LEAD_VALUES);
  } else if (!step.useAiGeneration) {
    if (!step.manualSubject || !step.manualBody) {
      throw new Error("Manual step is missing subject/body.");
    }
    const { bookingLink } = await getSenderContext(organisationId);
    try {
      subject = applyCalendlyLink(
        applyMergeTokens(step.manualSubject, SAMPLE_RECIPIENT),
        bookingLink,
      );
      body = applyCalendlyLink(applyMergeTokens(step.manualBody, SAMPLE_RECIPIENT), bookingLink);
    } catch (error) {
      if (error instanceof BookingLinkNotConfiguredError) {
        throw new CampaignActivationError(error.message);
      }
      throw error;
    }
  } else {
    const [
      {
        senderCompanyName,
        campaignPrompt,
        bookingLink,
        generationSystemPromptOverride,
        reviewSystemPromptOverride,
      },
      signatureText,
      aiConfig,
    ] = await Promise.all([
      getSenderContext(organisationId),
      resolveDefaultSignatureText(prisma, organisationId),
      resolveOrgAiConfig(prisma, organisationId),
    ]);
    if (!isAiConfigured(aiConfig)) {
      throw new Error("This step uses AI generation, but no AI provider is configured.");
    }
    const generated = await generateEmail(getAiEmailGenerator(aiConfig), {
      generationType: step.stepType,
      senderName: resolveInboxSenderName(inbox),
      senderCompanyName,
      callToAction: step.callToActionOverride ?? "connect and learn more about your priorities",
      facts: [],
      signatureText,
      // Mirrors processOutboxItem: the campaign's own prompt replaces the
      // organisation's, so a test send previews the campaign's real output.
      campaignPrompt: campaign.emailPromptInstructions?.trim() || campaignPrompt,
      bookingLink,
      generationSystemPromptOverride,
      reviewSystemPromptOverride,
    });
    subject = generated.subject;
    body = generated.body;
  }

  // The test previews step 1, which real sends deliver as plain text with no
  // unsubscribe footer/header (see processOutboxItem), so it does the same.
  const shownBody = body;

  const results = await Promise.all(
    emails.map(async (to) => {
      try {
        await sendFromInbox(prisma, inbox.id, { to, subject, body, plainTextOnly: true });
        return { email: to, ok: true };
      } catch (error) {
        return {
          email: to,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  return { subject, body: shownBody, results, previewedLead };
}

export async function getCampaignNoContactList(organisationId: string, campaignId: string) {
  return listCampaignExclusions(prisma, organisationId, campaignId);
}

export async function addToCampaignNoContactList(
  organisationId: string,
  campaignId: string,
  emails: string[],
  note?: string,
) {
  return addCampaignExclusions(prisma, { organisationId, campaignId, emails, note });
}

export async function removeFromCampaignNoContactList(
  organisationId: string,
  campaignId: string,
  email: string,
) {
  return removeCampaignExclusion(prisma, { organisationId, campaignId, email });
}
