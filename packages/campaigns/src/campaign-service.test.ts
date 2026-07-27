import { describe, expect, it, vi } from "vitest";
import {
  archiveCampaign,
  CampaignActivationError,
  getCampaign,
  updateCampaign,
} from "./campaign-service";

function fakePrisma(campaign: unknown, stepCount = 0, inboxCount = 0) {
  return {
    campaign: {
      create: vi.fn().mockImplementation(({ data }) => ({ id: "campaign-1", ...data })),
      findUnique: vi.fn().mockResolvedValue(campaign),
      update: vi.fn().mockImplementation(({ data }) => ({ ...(campaign as object), ...data })),
    },
    campaignStep: { count: vi.fn().mockResolvedValue(stepCount) },
    campaignInbox: { count: vi.fn().mockResolvedValue(inboxCount) },
  };
}

describe("updateCampaign", () => {
  it("updates fields for an owned campaign", async () => {
    const prisma = fakePrisma({ id: "campaign-1", organisationId: "org-1", name: "Old" });
    const result = await updateCampaign(prisma, "org-1", "campaign-1", { name: "New" });
    expect(result?.name).toBe("New");
  });

  it("returns null for a campaign in a different organisation", async () => {
    const prisma = fakePrisma({ id: "campaign-1", organisationId: "org-attacker" });
    const result = await updateCampaign(prisma, "org-victim", "campaign-1", { name: "New" });
    expect(result).toBeNull();
  });

  it("rejects activating a campaign with no steps", async () => {
    const prisma = fakePrisma({ id: "campaign-1", organisationId: "org-1" }, 0, 1);
    await expect(
      updateCampaign(prisma, "org-1", "campaign-1", { status: "ACTIVE" }),
    ).rejects.toBeInstanceOf(CampaignActivationError);
  });

  it("rejects activating a campaign with no connected inboxes", async () => {
    const prisma = fakePrisma({ id: "campaign-1", organisationId: "org-1" }, 1, 0);
    await expect(
      updateCampaign(prisma, "org-1", "campaign-1", { status: "ACTIVE" }),
    ).rejects.toBeInstanceOf(CampaignActivationError);
  });

  it("allows activating a campaign with at least one step and one inbox", async () => {
    const prisma = fakePrisma({ id: "campaign-1", organisationId: "org-1" }, 1, 1);
    const result = await updateCampaign(prisma, "org-1", "campaign-1", { status: "ACTIVE" });
    expect(result?.status).toBe("ACTIVE");
  });
});

describe("archiveCampaign", () => {
  it("sets status to ARCHIVED for an owned campaign", async () => {
    const prisma = fakePrisma({ id: "campaign-1", organisationId: "org-1" });
    const result = await archiveCampaign(prisma, "org-1", "campaign-1");
    expect(result?.status).toBe("ARCHIVED");
  });
});

describe("getCampaign", () => {
  it("returns null when the campaign belongs to a different organisation", async () => {
    const prisma = {
      campaign: { findUnique: vi.fn().mockResolvedValue({ organisationId: "org-attacker" }) },
    };
    const result = await getCampaign(prisma, "org-victim", "campaign-1");
    expect(result).toBeNull();
  });
});
