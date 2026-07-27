import { describe, expect, it, vi } from "vitest";
import { createMeeting, updateMeeting } from "./meeting-service";

function fakePrisma(lead: unknown, meeting: unknown = null) {
  return {
    lead: { findUnique: vi.fn().mockResolvedValue(lead) },
    meeting: {
      create: vi.fn().mockImplementation(({ data }) => ({ id: "meeting-1", ...data })),
      findUnique: vi.fn().mockResolvedValue(meeting),
      update: vi.fn().mockImplementation(({ data }) => ({ ...(meeting as object), ...data })),
    },
  };
}

describe("createMeeting", () => {
  it("creates a meeting for a lead owned by the organisation", async () => {
    const prisma = fakePrisma({ id: "lead-1", organisationId: "org-1" });
    const meeting = await createMeeting(prisma, {
      organisationId: "org-1",
      leadId: "lead-1",
      createdByUserId: "user-1",
    });
    expect(meeting.leadId).toBe("lead-1");
    expect(meeting.qualified).toBeUndefined(); // defaults applied by Prisma, not the service
  });

  it("throws when the lead belongs to a different organisation", async () => {
    const prisma = fakePrisma({ id: "lead-1", organisationId: "org-attacker" });
    await expect(
      createMeeting(prisma, {
        organisationId: "org-victim",
        leadId: "lead-1",
        createdByUserId: "user-1",
      }),
    ).rejects.toThrow();
  });
});

describe("updateMeeting", () => {
  it("updates a meeting owned by the organisation", async () => {
    const prisma = fakePrisma(null, { id: "meeting-1", organisationId: "org-1", qualified: false });
    const result = await updateMeeting(prisma, "org-1", "meeting-1", { qualified: true });
    expect(result?.qualified).toBe(true);
  });

  it("returns null for a meeting in a different organisation", async () => {
    const prisma = fakePrisma(null, { id: "meeting-1", organisationId: "org-attacker" });
    const result = await updateMeeting(prisma, "org-victim", "meeting-1", { qualified: true });
    expect(result).toBeNull();
  });
});
