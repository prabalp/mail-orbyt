import { describe, expect, it, vi } from "vitest";
import { addCampaignExclusions, removeCampaignExclusion } from "./exclusion-service";

function fakePrisma(options: { existing?: string[]; leadIds?: string[] } = {}) {
  return {
    campaign: {
      findUnique: vi.fn().mockResolvedValue({ id: "campaign-1", organisationId: "org-1" }),
    },
    campaignExclusion: {
      findMany: vi.fn().mockResolvedValue((options.existing ?? []).map((email) => ({ email }))),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    lead: {
      findMany: vi.fn().mockResolvedValue((options.leadIds ?? []).map((id) => ({ id }))),
    },
    outboxItem: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    campaignEnrollment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

describe("addCampaignExclusions", () => {
  it("normalizes, de-duplicates, and skips addresses already listed", async () => {
    const prisma = fakePrisma({ existing: ["old@x.com"] });
    const result = await addCampaignExclusions(prisma as never, {
      organisationId: "org-1",
      campaignId: "campaign-1",
      emails: [" New@X.com ", "new@x.com", "old@x.com"],
    });
    expect(result).toEqual({ added: 1, alreadyListed: 1, enrollmentsStopped: 0 });
    expect(prisma.campaignExclusion.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ email: "new@x.com", campaignId: "campaign-1" })],
      }),
    );
  });

  it("cancels scheduled emails and suppresses open enrollments for matching leads", async () => {
    const prisma = fakePrisma({ leadIds: ["lead-1"] });
    const result = await addCampaignExclusions(prisma as never, {
      organisationId: "org-1",
      campaignId: "campaign-1",
      emails: ["a@x.com"],
    });
    expect(result.enrollmentsStopped).toBe(1);
    expect(prisma.outboxItem.updateMany).toHaveBeenCalledWith({
      where: { campaignId: "campaign-1", leadId: { in: ["lead-1"] }, status: "SCHEDULED" },
      data: { status: "CANCELLED" },
    });
    expect(prisma.campaignEnrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUPPRESSED" }) }),
    );
  });

  it("rejects a campaign from another organisation", async () => {
    const prisma = fakePrisma();
    prisma.campaign.findUnique.mockResolvedValue({ id: "campaign-1", organisationId: "other" });
    await expect(
      addCampaignExclusions(prisma as never, {
        organisationId: "org-1",
        campaignId: "campaign-1",
        emails: ["a@x.com"],
      }),
    ).rejects.toThrow("Campaign not found");
  });
});

describe("removeCampaignExclusion", () => {
  it("removes by normalized address", async () => {
    const prisma = fakePrisma();
    expect(
      await removeCampaignExclusion(prisma as never, {
        organisationId: "org-1",
        campaignId: "campaign-1",
        email: " A@X.com ",
      }),
    ).toBe(true);
    expect(prisma.campaignExclusion.deleteMany).toHaveBeenCalledWith({
      where: { campaignId: "campaign-1", organisationId: "org-1", email: "a@x.com" },
    });
  });
});
