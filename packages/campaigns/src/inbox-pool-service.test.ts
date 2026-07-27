import { describe, expect, it, vi } from "vitest";
import { InvalidInboxPoolError, setCampaignInboxes } from "./inbox-pool-service";

const OWNED_CAMPAIGN = { id: "campaign-1", organisationId: "org-1" };

function fakePrisma(inboxes: { id: string; organisationId: string; status: string }[]) {
  return {
    campaign: { findUnique: vi.fn().mockResolvedValue(OWNED_CAMPAIGN) },
    inbox: { findMany: vi.fn().mockResolvedValue(inboxes) },
    campaignInbox: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "ci-1", ...data })),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

describe("setCampaignInboxes", () => {
  it("replaces the pool when every inbox is owned and CONNECTED", async () => {
    const prisma = fakePrisma([{ id: "inbox-1", organisationId: "org-1", status: "CONNECTED" }]);
    await setCampaignInboxes(prisma, "org-1", "campaign-1", ["inbox-1"]);
    expect(prisma.campaignInbox.deleteMany).toHaveBeenCalledWith({
      where: { campaignId: "campaign-1" },
    });
    expect(prisma.campaignInbox.create).toHaveBeenCalledWith({
      data: { campaignId: "campaign-1", inboxId: "inbox-1" },
    });
  });

  it("rejects an inbox id that doesn't exist", async () => {
    const prisma = fakePrisma([]);
    await expect(
      setCampaignInboxes(prisma, "org-1", "campaign-1", ["missing-inbox"]),
    ).rejects.toBeInstanceOf(InvalidInboxPoolError);
  });

  it("rejects an inbox belonging to a different organisation", async () => {
    const prisma = fakePrisma([
      { id: "inbox-1", organisationId: "org-attacker", status: "CONNECTED" },
    ]);
    await expect(
      setCampaignInboxes(prisma, "org-1", "campaign-1", ["inbox-1"]),
    ).rejects.toBeInstanceOf(InvalidInboxPoolError);
  });

  it("rejects an inbox that isn't CONNECTED", async () => {
    const prisma = fakePrisma([
      { id: "inbox-1", organisationId: "org-1", status: "REAUTH_REQUIRED" },
    ]);
    await expect(
      setCampaignInboxes(prisma, "org-1", "campaign-1", ["inbox-1"]),
    ).rejects.toBeInstanceOf(InvalidInboxPoolError);
  });
});
