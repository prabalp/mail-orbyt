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
  callToActionOverride?: string;
  manualSubject?: string;
  manualBody?: string;
}

function assertValidContent(
  params: Pick<AddStepParams, "useAiGeneration" | "manualSubject" | "manualBody">,
) {
  if (params.useAiGeneration === false && (!params.manualSubject || !params.manualBody)) {
    throw new InvalidStepError(
      "A step with AI generation disabled requires both manualSubject and manualBody.",
    );
  }
}

async function assertOwnedCampaign(prisma: Prisma, organisationId: string, campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organisationId !== organisationId) return null;
  return campaign;
}

export async function addStep(
  prisma: Prisma,
  organisationId: string,
  campaignId: string,
  params: AddStepParams,
) {
  const campaign = await assertOwnedCampaign(prisma, organisationId, campaignId);
  if (!campaign) return null;
  assertValidContent(params);

  const lastStep = await prisma.campaignStep.findFirst({
    where: { campaignId },
    orderBy: { orderIndex: "desc" },
  });

  return prisma.campaignStep.create({
    data: {
      campaignId,
      orderIndex: (lastStep?.orderIndex ?? -1) + 1,
      stepType: params.stepType,
      delayDays: params.delayDays ?? 0,
      useAiGeneration: params.useAiGeneration ?? true,
      callToActionOverride: params.callToActionOverride,
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

  assertValidContent({
    useAiGeneration: patch.useAiGeneration ?? step.useAiGeneration,
    manualSubject: patch.manualSubject ?? step.manualSubject ?? undefined,
    manualBody: patch.manualBody ?? step.manualBody ?? undefined,
  });

  return prisma.campaignStep.update({ where: { id: stepId }, data: patch });
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
