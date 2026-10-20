import type { PrismaClient, SequenceStepType } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "campaign" | "campaignStep" | "$transaction">;

export class InvalidStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStepError";
  }
}

export interface AddStepParams {
  stepType: SequenceStepType;
  delayDays?: number;
  useAiGeneration?: boolean;
  useImportedContent?: boolean;
  callToActionOverride?: string;
  stepInstructions?: string | null;
  manualSubject?: string | null;
  manualBody?: string | null;
}

function assertValidContent(params: {
  useAiGeneration?: boolean;
  useImportedContent?: boolean;
  manualSubject?: string | null;
  manualBody?: string | null;
}) {
  if (params.useImportedContent && params.useAiGeneration === true) {
    throw new InvalidStepError("A step cannot both generate with AI and use imported emails.");
  }
  if (params.useImportedContent) return;
  if (params.useAiGeneration === false && (!params.manualSubject || !params.manualBody)) {
    throw new InvalidStepError(
      "A shared template requires both manualSubject and manualBody. Choose imported emails to send the lead's prewritten copy instead.",
    );
  }
}

async function assertOwnedCampaign(prisma: Prisma, organisationId: string, campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organisationId !== organisationId) return null;
  return campaign;
}

const SOURCE_LABEL = {
  AI: "AI-written",
  TEMPLATE: "template",
  IMPORTED: "uploaded-list",
} as const;

/** The content source a set of step flags amounts to. */
function stepSource(flags: { useAiGeneration: boolean; useImportedContent: boolean }) {
  if (flags.useImportedContent) return "IMPORTED" as const;
  return flags.useAiGeneration ? ("AI" as const) : ("TEMPLATE" as const);
}

function assertMatchesCampaignSource(
  campaign: { contentSource: "AI" | "TEMPLATE" | "IMPORTED" },
  flags: { useAiGeneration: boolean; useImportedContent: boolean },
) {
  if (stepSource(flags) !== campaign.contentSource) {
    throw new InvalidStepError(
      `This is a ${SOURCE_LABEL[campaign.contentSource]} campaign, so its steps must be too.`,
    );
  }
}

export async function addStep(
  prisma: Prisma,
  organisationId: string,
  campaignId: string,
  params: AddStepParams,
) {
  const campaign = await assertOwnedCampaign(prisma, organisationId, campaignId);
  if (!campaign) return null;
  // Steps follow the campaign's content source; a caller that doesn't say gets it.
  const flags = {
    useImportedContent: params.useImportedContent ?? campaign.contentSource === "IMPORTED",
    useAiGeneration: params.useAiGeneration ?? campaign.contentSource === "AI",
  };
  if (flags.useImportedContent) flags.useAiGeneration = false;
  params = { ...params, ...flags };
  assertValidContent(params);
  if (campaign.routingMode !== "JOURNEY") assertMatchesCampaignSource(campaign, flags);

  const lastStep = await prisma.campaignStep.findFirst({
    where: { campaignId },
    orderBy: { orderIndex: "desc" },
  });
  if (campaign.routingMode === "JOURNEY") {
    // A journey's sequence lives in each lead's imported email graph; the one
    // step is just the placeholder every node send hangs off.
    if (lastStep) {
      throw new InvalidStepError(
        "A journey campaign has a single step; its emails come from the imported graph.",
      );
    }
    if (!params.useImportedContent) {
      throw new InvalidStepError("A journey campaign's step must use imported content.");
    }
  }

  return prisma.campaignStep.create({
    data: {
      campaignId,
      orderIndex: (lastStep?.orderIndex ?? -1) + 1,
      stepType: params.stepType,
      delayDays: params.delayDays ?? 0,
      useAiGeneration: params.useImportedContent ? false : (params.useAiGeneration ?? true),
      useImportedContent: params.useImportedContent ?? false,
      callToActionOverride: params.callToActionOverride,
      stepInstructions: params.stepInstructions,
      manualSubject: params.manualSubject,
      manualBody: params.manualBody,
    },
  });
}

export async function updateStep(
  prisma: Prisma,
  organisationId: string,
  campaignId: string,
  stepId: string,
  patch: Partial<AddStepParams>,
) {
  const campaign = await assertOwnedCampaign(prisma, organisationId, campaignId);
  if (!campaign) return null;
  const step = await prisma.campaignStep.findUnique({ where: { id: stepId } });
  if (!step || step.campaignId !== campaignId) return null;

  const useImportedContent = patch.useImportedContent ?? step.useImportedContent;
  const useAiGeneration = useImportedContent
    ? false
    : (patch.useAiGeneration ?? step.useAiGeneration);
  const touchesContent =
    patch.useAiGeneration !== undefined || patch.useImportedContent !== undefined;
  if (touchesContent && campaign.routingMode !== "JOURNEY") {
    assertMatchesCampaignSource(campaign, { useAiGeneration, useImportedContent });
  }
  assertValidContent({
    useAiGeneration,
    useImportedContent,
    manualSubject: patch.manualSubject !== undefined ? patch.manualSubject : step.manualSubject,
    manualBody: patch.manualBody !== undefined ? patch.manualBody : step.manualBody,
  });

  return prisma.campaignStep.update({
    where: { id: stepId },
    data: { ...patch, useAiGeneration, useImportedContent },
  });
}

/** Removes a step and renumbers the remaining steps to stay contiguous (0..n-1), so orderIndex always reflects actual send order with no gaps. */
export async function removeStep(
  prisma: Prisma,
  organisationId: string,
  campaignId: string,
  stepId: string,
) {
  const campaign = await assertOwnedCampaign(prisma, organisationId, campaignId);
  if (!campaign) return null;
  const step = await prisma.campaignStep.findUnique({ where: { id: stepId } });
  if (!step || step.campaignId !== campaignId) return null;

  const remaining = await prisma.campaignStep.findMany({
    where: { campaignId, id: { not: stepId } },
    orderBy: { orderIndex: "asc" },
  });

  await prisma.$transaction([
    prisma.campaignStep.delete({ where: { id: stepId } }),
    ...remaining.map((s, index) =>
      prisma.campaignStep.update({ where: { id: s.id }, data: { orderIndex: index } }),
    ),
  ]);

  return true;
}

/** Reorders steps to match the given stepId order exactly — the set of ids must match the campaign's existing steps exactly, or the reorder is rejected rather than silently dropping/adding steps. */
export async function reorderSteps(
  prisma: Prisma,
  organisationId: string,
  campaignId: string,
  orderedStepIds: string[],
) {
  const campaign = await assertOwnedCampaign(prisma, organisationId, campaignId);
  if (!campaign) return null;

  const existing = await prisma.campaignStep.findMany({ where: { campaignId } });
  const existingIds = new Set(existing.map((s) => s.id));
  const providedIds = new Set(orderedStepIds);

  if (
    existingIds.size !== providedIds.size ||
    [...existingIds].some((id) => !providedIds.has(id))
  ) {
    throw new InvalidStepError(
      "orderedStepIds must contain exactly the campaign's existing steps.",
    );
  }

  // Two-phase update: writing straight to the final 0..n-1 indices in one
  // pass collides with `@@unique([campaignId, orderIndex])` the instant a
  // reorder isn't a no-op — e.g. swapping two steps tries to write step B's
  // current index into step A while B still holds it. Moving every step to
  // a disjoint high range first (guaranteed clear of 0..n-1, and of each
  // other) lets the second pass land on final indices with nothing left to
  // collide with.
  await prisma.$transaction([
    ...orderedStepIds.map((stepId, index) =>
      prisma.campaignStep.update({
        where: { id: stepId },
        data: { orderIndex: orderedStepIds.length + index },
      }),
    ),
    ...orderedStepIds.map((stepId, index) =>
      prisma.campaignStep.update({ where: { id: stepId }, data: { orderIndex: index } }),
    ),
  ]);

  return prisma.campaignStep.findMany({ where: { campaignId }, orderBy: { orderIndex: "asc" } });
}
