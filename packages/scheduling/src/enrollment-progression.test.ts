import { describe, expect, it, vi } from "vitest";
import {
  rescheduleCampaignOutboxItems,
  scheduleNextStepForEnrollment,
} from "./enrollment-progression";

const ALWAYS_OPEN_CAMPAIGN = {
  organisationId: "org-1",
  timezone: "UTC",
  sendingDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  sendingWindowStartMinute: 0,
  sendingWindowEndMinute: 1440,
};

function fakePrisma(options: { enrollment?: unknown; step?: unknown; existingItem?: unknown }) {
  return {
    campaignEnrollment: {
      findUnique: vi.fn().mockResolvedValue(options.enrollment ?? null),
      update: vi
        .fn()
        .mockImplementation(({ data }) => ({ ...(options.enrollment as object), ...data })),
    },
    campaignStep: { findUnique: vi.fn().mockResolvedValue(options.step ?? null) },
    outboxItem: {
      findUnique: vi.fn().mockResolvedValue(options.existingItem ?? null),
      create: vi.fn().mockImplementation(({ data }) => ({ id: "outbox-new", ...data })),
    },
  };
}

describe("scheduleNextStepForEnrollment", () => {
  it("returns null for a nonexistent enrollment", async () => {
    const prisma = fakePrisma({});
    expect(await scheduleNextStepForEnrollment(prisma, "missing")).toBeNull();
  });

  it("returns null for a completed/exited enrollment", async () => {
    const prisma = fakePrisma({ enrollment: { id: "e1", status: "COMPLETED" } });
    expect(await scheduleNextStepForEnrollment(prisma, "e1")).toBeNull();
  });

  it("marks the enrollment COMPLETED when there is no next step", async () => {
    const prisma = fakePrisma({
      enrollment: {
        id: "e1",
        status: "PENDING",
        campaignId: "c1",
        currentStepIndex: 2,
        campaign: ALWAYS_OPEN_CAMPAIGN,
      },
      step: null,
    });
    const result = await scheduleNextStepForEnrollment(prisma, "e1");
    expect(result).toBeNull();
    expect(prisma.campaignEnrollment.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { status: "COMPLETED" },
    });
  });

  it("returns the existing OutboxItem instead of creating a duplicate", async () => {
    const prisma = fakePrisma({
      enrollment: {
        id: "e1",
        status: "PENDING",
        campaignId: "c1",
        leadId: "lead-1",
        currentStepIndex: 0,
        enrolledAt: new Date(),
        campaign: ALWAYS_OPEN_CAMPAIGN,
      },
      step: { id: "step-1", orderIndex: 0, delayDays: 0 },
      existingItem: { id: "outbox-existing" },
    });
    const result = await scheduleNextStepForEnrollment(prisma, "e1");
    expect(result).toEqual({ id: "outbox-existing" });
    expect(prisma.outboxItem.create).not.toHaveBeenCalled();
  });

  it("creates a new OutboxItem scheduled at/after the delay from lastStepSentAt", async () => {
    const lastSent = new Date("2026-07-27T10:00:00Z");
    const prisma = fakePrisma({
      enrollment: {
        id: "e1",
        status: "ACTIVE",
        campaignId: "c1",
        leadId: "lead-1",
        currentStepIndex: 1,
        enrolledAt: new Date("2026-07-20T10:00:00Z"),
        lastStepSentAt: lastSent,
        campaign: ALWAYS_OPEN_CAMPAIGN,
      },
      step: { id: "step-2", orderIndex: 1, delayDays: 3 },
      existingItem: null,
    });

    const result = await scheduleNextStepForEnrollment(prisma, "e1");
    expect(result.campaignStepId).toBe("step-2");
    expect(result.scheduledFor.getTime()).toBeGreaterThanOrEqual(
      lastSent.getTime() + 3 * 24 * 60 * 60 * 1000,
    );
  });
});

/** Mon-Fri, 09:00-17:00 UTC — the shape a campaign has before someone widens it. */
const WEEKDAYS_9_TO_5 = {
  id: "c1",
  organisationId: "org-1",
  timezone: "UTC",
  sendingDaysOfWeek: [1, 2, 3, 4, 5],
  sendingWindowStartMinute: 540,
  sendingWindowEndMinute: 1020,
};

function fakeReschedulePrisma(campaign: unknown, items: unknown[]) {
  return {
    campaign: { findUnique: vi.fn().mockResolvedValue(campaign) },
    outboxItem: {
      findMany: vi.fn().mockResolvedValue(items),
      update: vi.fn().mockImplementation(({ data }) => data),
    },
  };
}

function scheduledItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    scheduledFor: new Date("2026-08-10T09:00:00Z"),
    enrollment: { enrolledAt: new Date("2026-08-09T09:30:00Z"), lastStepSentAt: null },
    campaignStep: { delayDays: 0 },
    ...overrides,
  };
}

describe("rescheduleCampaignOutboxItems", () => {
  // The production bug: items created while the window was Mon-Fri stayed
  // pinned to Monday after the campaign was widened to include Sunday, so the
  // campaign looked stalled all weekend.
  it("pulls items into a newly widened window", async () => {
    const now = new Date("2026-08-09T09:52:00Z"); // Sunday, inside the new window
    const prisma = fakeReschedulePrisma(
      { ...WEEKDAYS_9_TO_5, sendingDaysOfWeek: [0, 1, 2, 3, 4, 5] },
      [scheduledItem()],
    );

    const count = await rescheduleCampaignOutboxItems(prisma, "c1", now);

    expect(count).toBe(1);
    expect(prisma.outboxItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { scheduledFor: now },
    });
  });

  it("pushes items out when the window narrows", async () => {
    const now = new Date("2026-08-10T09:00:00Z"); // Monday 09:00
    const prisma = fakeReschedulePrisma({ ...WEEKDAYS_9_TO_5, sendingWindowStartMinute: 900 }, [
      scheduledItem(),
    ]);

    await rescheduleCampaignOutboxItems(prisma, "c1", now);

    const [{ data }] = prisma.outboxItem.update.mock.calls[0];
    expect(data.scheduledFor).toEqual(new Date("2026-08-10T15:00:00Z"));
  });

  it("never pulls a follow-up in ahead of its step delay", async () => {
    const now = new Date("2026-08-10T09:00:00Z");
    const prisma = fakeReschedulePrisma(
      { ...WEEKDAYS_9_TO_5, sendingDaysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
      [
        scheduledItem({
          enrollment: {
            enrolledAt: new Date("2026-08-01T09:00:00Z"),
            lastStepSentAt: new Date("2026-08-10T08:00:00Z"),
          },
          campaignStep: { delayDays: 3 },
        }),
      ],
    );

    await rescheduleCampaignOutboxItems(prisma, "c1", now);

    const [{ data }] = prisma.outboxItem.update.mock.calls[0];
    expect(data.scheduledFor.getTime()).toBeGreaterThanOrEqual(
      new Date("2026-08-13T08:00:00Z").getTime(),
    );
  });

  it("writes nothing when the recomputed time is unchanged", async () => {
    const now = new Date("2026-08-10T08:00:00Z");
    const prisma = fakeReschedulePrisma(WEEKDAYS_9_TO_5, [scheduledItem()]);

    expect(await rescheduleCampaignOutboxItems(prisma, "c1", now)).toBe(0);
    expect(prisma.outboxItem.update).not.toHaveBeenCalled();
  });

  // Half-rescheduling a campaign is worse than refusing the edit, so the
  // throw has to land before the first write.
  it("writes nothing when the window can never open", async () => {
    const prisma = fakeReschedulePrisma({ ...WEEKDAYS_9_TO_5, sendingDaysOfWeek: [] }, [
      scheduledItem({ id: "item-1" }),
      scheduledItem({ id: "item-2" }),
    ]);

    await expect(
      rescheduleCampaignOutboxItems(prisma, "c1", new Date("2026-08-10T09:00:00Z")),
    ).rejects.toThrow(/No sendable time/);
    expect(prisma.outboxItem.update).not.toHaveBeenCalled();
  });

  it("returns 0 for a nonexistent campaign", async () => {
    const prisma = fakeReschedulePrisma(null, []);
    expect(await rescheduleCampaignOutboxItems(prisma, "missing")).toBe(0);
    expect(prisma.outboxItem.findMany).not.toHaveBeenCalled();
  });
});
