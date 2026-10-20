import { describe, expect, it, vi } from "vitest";
import { addStep, InvalidStepError, removeStep, reorderSteps, updateStep } from "./step-service";

function fakePrisma(options: {
  campaign?: unknown;
  lastStep?: unknown;
  steps?: { id: string; orderIndex: number }[];
  step?: unknown;
}) {
  const steps = options.steps ?? [];
  return {
    campaign: { findUnique: vi.fn().mockResolvedValue(options.campaign ?? null) },
    campaignStep: {
      create: vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: "step-new", ...data })),
      findFirst: vi.fn().mockResolvedValue(options.lastStep ?? null),
      findUnique: vi.fn().mockResolvedValue(options.step ?? null),
      findMany: vi.fn().mockResolvedValue(steps),
      update: vi
        .fn()
        .mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete: vi.fn().mockImplementation(({ where }) => Promise.resolve({ id: where.id })),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const OWNED_CAMPAIGN = { id: "campaign-1", organisationId: "org-1" };

describe("addStep", () => {
  it("appends a step at the next orderIndex", async () => {
    const prisma = fakePrisma({ campaign: OWNED_CAMPAIGN, lastStep: { orderIndex: 1 } });
    const step = await addStep(prisma, "org-1", "campaign-1", { stepType: "FOLLOW_UP" });
    expect(step?.orderIndex).toBe(2);
  });

  it("starts at orderIndex 0 for the first step", async () => {
    const prisma = fakePrisma({ campaign: OWNED_CAMPAIGN, lastStep: null });
    const step = await addStep(prisma, "org-1", "campaign-1", { stepType: "INITIAL" });
    expect(step?.orderIndex).toBe(0);
  });

  it("stores an imported-email step without a shared template", async () => {
    const prisma = fakePrisma({ campaign: OWNED_CAMPAIGN, lastStep: null });
    const step = await addStep(prisma, "org-1", "campaign-1", {
      stepType: "INITIAL",
      useImportedContent: true,
    });
    expect(step?.useAiGeneration).toBe(false);
    expect(step?.useImportedContent).toBe(true);
  });

  it("rejects a manual step missing subject/body", async () => {
    const prisma = fakePrisma({ campaign: OWNED_CAMPAIGN });
    await expect(
      addStep(prisma, "org-1", "campaign-1", { stepType: "INITIAL", useAiGeneration: false }),
    ).rejects.toBeInstanceOf(InvalidStepError);
  });

  it("returns null for a campaign in a different organisation", async () => {
    const prisma = fakePrisma({ campaign: { id: "campaign-1", organisationId: "org-attacker" } });
    const result = await addStep(prisma, "org-victim", "campaign-1", { stepType: "INITIAL" });
    expect(result).toBeNull();
  });
});

describe("updateStep", () => {
  it("rejects disabling AI generation without providing manual content", async () => {
    const prisma = fakePrisma({
      campaign: OWNED_CAMPAIGN,
      step: {
        id: "step-1",
        campaignId: "campaign-1",
        useAiGeneration: true,
        manualSubject: null,
        manualBody: null,
      },
    });
    await expect(
      updateStep(prisma, "org-1", "campaign-1", "step-1", { useAiGeneration: false }),
    ).rejects.toBeInstanceOf(InvalidStepError);
  });
});

describe("removeStep", () => {
  it("deletes the step and renumbers the remaining ones contiguously", async () => {
    const prisma = fakePrisma({
      campaign: OWNED_CAMPAIGN,
      step: { id: "step-2", campaignId: "campaign-1" },
      steps: [
        { id: "step-1", orderIndex: 0 },
        { id: "step-3", orderIndex: 2 },
      ],
    });
    const result = await removeStep(prisma, "org-1", "campaign-1", "step-2");
    expect(result).toBe(true);
    expect(prisma.campaignStep.update).toHaveBeenCalledWith({
      where: { id: "step-1" },
      data: { orderIndex: 0 },
    });
    expect(prisma.campaignStep.update).toHaveBeenCalledWith({
      where: { id: "step-3" },
      data: { orderIndex: 1 },
    });
  });
});

describe("reorderSteps", () => {
  it("rejects a reorder whose id set doesn't match existing steps", async () => {
    const prisma = fakePrisma({
      campaign: OWNED_CAMPAIGN,
      steps: [
        { id: "step-1", orderIndex: 0 },
        { id: "step-2", orderIndex: 1 },
      ],
    });
    await expect(
      reorderSteps(prisma, "org-1", "campaign-1", ["step-1", "step-999"]),
    ).rejects.toBeInstanceOf(InvalidStepError);
  });

  it("updates orderIndex to match the given order", async () => {
    const prisma = fakePrisma({
      campaign: OWNED_CAMPAIGN,
      steps: [
        { id: "step-1", orderIndex: 0 },
        { id: "step-2", orderIndex: 1 },
      ],
    });
    await reorderSteps(prisma, "org-1", "campaign-1", ["step-2", "step-1"]);
    expect(prisma.campaignStep.update).toHaveBeenCalledWith({
      where: { id: "step-2" },
      data: { orderIndex: 0 },
    });
    expect(prisma.campaignStep.update).toHaveBeenCalledWith({
      where: { id: "step-1" },
      data: { orderIndex: 1 },
    });
  });
});
