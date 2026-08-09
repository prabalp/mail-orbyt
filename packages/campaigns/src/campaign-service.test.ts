import { describe, expect, it, vi } from "vitest";
import {
  archiveCampaign,
  CampaignActivationError,
  getCampaign,
  updateCampaign,
} from "./campaign-service";

function fakePrisma(campaign: unknown, stepCount = 0, inboxCount = 0) {
  // findUnique is called twice on the schedule-edit path — once by
  // updateCampaign for the ownership check, once by the reschedule pass, which
  // must see the POST-update row. So the fake mutates in place.
  const stored = campaign as Record<string, unknown> | null;
  return {
    campaign: {
      create: vi.fn().mockImplementation(({ data }) => ({ id: "campaign-1", ...data })),
      findUnique: vi.fn().mockImplementation(async () => stored),
      update: vi.fn().mockImplementation(({ data }) => Object.assign(stored ?? {}, data)),
    },
    campaignStep: { count: vi.fn().mockResolvedValue(stepCount) },
    campaignInbox: { count: vi.fn().mockResolvedValue(inboxCount) },
    outboxItem: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
  };
}

const SCHEDULED_CAMPAIGN = {
  id: "campaign-1",
  organisationId: "org-1",
  timezone: "UTC",
  sendingDaysOfWeek: [1, 2, 3, 4, 5],
  sendingWindowStartMinute: 540,
  sendingWindowEndMinute: 1020,
};

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

  // A send time is baked in when the item is created, so anything the pause
  // left pointing at a stale slot would keep that time and the resumed
  // campaign would look like it had done nothing.
  it("re-anchors pending sends when a paused campaign is resumed", async () => {
    const prisma = fakePrisma({ ...SCHEDULED_CAMPAIGN, status: "PAUSED" }, 1, 1);
    await updateCampaign(prisma, "org-1", "campaign-1", { status: "ACTIVE" });
    expect(prisma.outboxItem.findMany).toHaveBeenCalled();
  });

  it("leaves pending sends alone when a campaign is paused", async () => {
    const prisma = fakePrisma({ ...SCHEDULED_CAMPAIGN, status: "ACTIVE" });
    await updateCampaign(prisma, "org-1", "campaign-1", { status: "PAUSED" });
    expect(prisma.outboxItem.findMany).not.toHaveBeenCalled();
  });

  // Without this, a window edit applies only to items created afterwards and
  // already-scheduled sends stay pinned to the old window.
  it("reschedules pending outbox items when the sending window moves", async () => {
    const prisma = fakePrisma({ ...SCHEDULED_CAMPAIGN });
    await updateCampaign(prisma, "org-1", "campaign-1", { sendingDaysOfWeek: [0, 1, 2, 3, 4, 5] });
    expect(prisma.outboxItem.findMany).toHaveBeenCalledWith({
      where: { campaignId: "campaign-1", status: "SCHEDULED" },
      include: { enrollment: true, campaignStep: true },
    });
  });

  it("reschedules when the timezone alone changes", async () => {
    const prisma = fakePrisma({ ...SCHEDULED_CAMPAIGN });
    await updateCampaign(prisma, "org-1", "campaign-1", { timezone: "Asia/Kolkata" });
    expect(prisma.outboxItem.findMany).toHaveBeenCalled();
  });

  it("leaves pending sends alone when the patch does not touch the window", async () => {
    const prisma = fakePrisma({ ...SCHEDULED_CAMPAIGN });
    await updateCampaign(prisma, "org-1", "campaign-1", { name: "Renamed" });
    expect(prisma.outboxItem.findMany).not.toHaveBeenCalled();
  });

  // The UI posts the whole schedule form on every save, so an unchanged
  // resave must not churn send times.
  it("leaves pending sends alone when the window is resaved unchanged", async () => {
    const prisma = fakePrisma({ ...SCHEDULED_CAMPAIGN });
    await updateCampaign(prisma, "org-1", "campaign-1", {
      timezone: "UTC",
      sendingDaysOfWeek: [5, 4, 3, 2, 1],
      sendingWindowStartMinute: 540,
      sendingWindowEndMinute: 1020,
    });
    expect(prisma.outboxItem.findMany).not.toHaveBeenCalled();
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
      outboxItem: { aggregate: vi.fn() },
    };
    const result = await getCampaign(prisma, "org-victim", "campaign-1");
    expect(result).toBeNull();
    // The ownership check has to short-circuit before any campaign data is read.
    expect(prisma.outboxItem.aggregate).not.toHaveBeenCalled();
  });

  // Backs the "next email goes out ..." line in the schedule UI, which is how
  // a user confirms a window edit actually moved the queued sends.
  it("reports the queued send count and the earliest send time", async () => {
    const prisma = {
      campaign: { findUnique: vi.fn().mockResolvedValue({ ...SCHEDULED_CAMPAIGN }) },
      outboxItem: {
        aggregate: vi.fn().mockResolvedValue({
          _count: { _all: 10 },
          _min: { scheduledFor: new Date("2026-08-10T09:00:00Z") },
        }),
      },
    };

    const result = await getCampaign(prisma, "org-1", "campaign-1");

    expect(result?.pendingSends).toEqual({
      count: 10,
      nextScheduledFor: new Date("2026-08-10T09:00:00Z"),
    });
  });

  it("reports no next send when nothing is queued", async () => {
    const prisma = {
      campaign: { findUnique: vi.fn().mockResolvedValue({ ...SCHEDULED_CAMPAIGN }) },
      outboxItem: {
        aggregate: vi.fn().mockResolvedValue({ _count: { _all: 0 }, _min: { scheduledFor: null } }),
      },
    };

    const result = await getCampaign(prisma, "org-1", "campaign-1");

    expect(result?.pendingSends).toEqual({ count: 0, nextScheduledFor: null });
  });
});
