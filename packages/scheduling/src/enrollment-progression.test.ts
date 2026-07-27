import { describe, expect, it, vi } from "vitest";
import { scheduleNextStepForEnrollment } from "./enrollment-progression";

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
