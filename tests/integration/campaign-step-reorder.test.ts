import { randomBytes } from "node:crypto";
import { addStep, createCampaign, reorderSteps } from "@mail-orbyt/campaigns";
import { prisma } from "@mail-orbyt/database";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Runs against the real Postgres from docker-compose. `reorderSteps`'
 * mocked unit tests can't see `@@unique([campaignId, orderIndex])` — a
 * mock happily accepts two rows holding the same orderIndex mid-update.
 * Real Postgres does not: writing final indices in a single pass hits the
 * constraint the instant a reorder swaps two steps, since the step moving
 * INTO index 0 collides with the step still sitting there until its own
 * update runs. Caught via the MCP tool surface's own end-to-end testing,
 * not by the unit suite.
 */

function uniqueSlug(): string {
  return `reorder-test-org-${randomBytes(6).toString("hex")}`;
}

describe("reorderSteps (end to end against real Postgres)", () => {
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    for (const organisationId of createdOrgIds) {
      await prisma.campaignStep.deleteMany({ where: { campaign: { organisationId } } });
      await prisma.campaign.deleteMany({ where: { organisationId } });
      await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("swaps two steps without a unique-constraint violation", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Reorder Test Org", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const campaign = await createCampaign(prisma, {
      organisationId: org.id,
      name: "Reorder Test Campaign",
      contentSource: "TEMPLATE",
      createdByUserId: "seed-user",
    });

    const step1 = await addStep(prisma, org.id, campaign.id, {
      stepType: "INITIAL",
      useAiGeneration: false,
      manualSubject: "S1",
      manualBody: "B1",
    });
    const step2 = await addStep(prisma, org.id, campaign.id, {
      stepType: "FOLLOW_UP",
      useAiGeneration: false,
      manualSubject: "S2",
      manualBody: "B2",
    });
    if (!step1 || !step2) throw new Error("fixture steps were not created");

    const reordered = await reorderSteps(prisma, org.id, campaign.id, [step2.id, step1.id]);

    expect(reordered?.map((step) => step.id)).toEqual([step2.id, step1.id]);
    expect(reordered?.map((step) => step.orderIndex)).toEqual([0, 1]);
  });

  it("swaps three steps in a full rotation without a unique-constraint violation", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Reorder Test Org 3-Way", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const campaign = await createCampaign(prisma, {
      organisationId: org.id,
      name: "Reorder Test Campaign 3-Way",
      contentSource: "TEMPLATE",
      createdByUserId: "seed-user",
    });

    const steps = [];
    for (const label of ["A", "B", "C"]) {
      const step = await addStep(prisma, org.id, campaign.id, {
        stepType: "FOLLOW_UP",
        useAiGeneration: false,
        manualSubject: label,
        manualBody: label,
      });
      if (!step) throw new Error("fixture step was not created");
      steps.push(step);
    }

    // Rotate: [A, B, C] (0,1,2) -> [C, A, B] — every step's target index is
    // currently held by a DIFFERENT step, the case most likely to collide.
    const rotated = await reorderSteps(prisma, org.id, campaign.id, [
      steps[2]!.id,
      steps[0]!.id,
      steps[1]!.id,
    ]);

    expect(rotated?.map((step) => step.id)).toEqual([steps[2]!.id, steps[0]!.id, steps[1]!.id]);
    expect(rotated?.map((step) => step.orderIndex)).toEqual([0, 1, 2]);
  });
});
