import { describe, expect, it, vi } from "vitest";

const isSuppressedMock = vi.fn();
vi.mock("@mail-orbyt/leads", () => ({ isSuppressed: isSuppressedMock }));

const { enrollLeads, exitEnrollment } = await import("./enrollment-service");

const OWNED_CAMPAIGN = { id: "campaign-1", organisationId: "org-1" };

function fakePrisma(options: {
  leads?: { id: string; email: string | null }[];
  existingEnrollments?: { leadId: string }[];
  enrollment?: unknown;
}) {
  return {
    campaign: { findUnique: vi.fn().mockResolvedValue(OWNED_CAMPAIGN) },
    campaignStep: { findMany: vi.fn().mockResolvedValue([]) },
    lead: { findMany: vi.fn().mockResolvedValue(options.leads ?? []) },
    campaignEnrollment: {
      findMany: vi.fn().mockResolvedValue(options.existingEnrollments ?? []),
      create: vi.fn().mockImplementation(({ data }) => ({ id: "enrollment-new", ...data })),
      findUnique: vi.fn().mockResolvedValue(options.enrollment ?? null),
      update: vi
        .fn()
        .mockImplementation(({ data }) => ({ ...(options.enrollment as object), ...data })),
    },
  };
}

describe("enrollLeads", () => {
  it("enrolls a non-suppressed lead as PENDING", async () => {
    isSuppressedMock.mockResolvedValue(false);
    const prisma = fakePrisma({ leads: [{ id: "lead-1", email: "a@acme.example" }] });
    const result = await enrollLeads(prisma, "org-1", "campaign-1", ["lead-1"]);
    expect(result).toEqual({ enrolled: 1, alreadyEnrolled: 0, suppressed: 0 });
    expect(prisma.campaignEnrollment.create).toHaveBeenCalledWith({
      data: { campaignId: "campaign-1", leadId: "lead-1", status: "PENDING" },
    });
  });

  it("enrolls a suppressed lead as SUPPRESSED rather than skipping it", async () => {
    isSuppressedMock.mockResolvedValue(true);
    const prisma = fakePrisma({ leads: [{ id: "lead-1", email: "a@acme.example" }] });
    const result = await enrollLeads(prisma, "org-1", "campaign-1", ["lead-1"]);
    expect(result).toEqual({ enrolled: 0, alreadyEnrolled: 0, suppressed: 1 });
    expect(prisma.campaignEnrollment.create).toHaveBeenCalledWith({
      data: { campaignId: "campaign-1", leadId: "lead-1", status: "SUPPRESSED" },
    });
  });

  it("skips a lead already enrolled", async () => {
    const prisma = fakePrisma({
      leads: [{ id: "lead-1", email: "a@acme.example" }],
      existingEnrollments: [{ leadId: "lead-1" }],
    });
    const result = await enrollLeads(prisma, "org-1", "campaign-1", ["lead-1"]);
    expect(result).toEqual({ enrolled: 0, alreadyEnrolled: 1, suppressed: 0 });
    expect(prisma.campaignEnrollment.create).not.toHaveBeenCalled();
  });

  it("throws for a campaign in a different organisation", async () => {
    const prisma = {
      campaign: {
        findUnique: vi.fn().mockResolvedValue({ id: "campaign-1", organisationId: "org-attacker" }),
      },
    };
    await expect(enrollLeads(prisma, "org-victim", "campaign-1", ["lead-1"])).rejects.toThrow();
  });
});

describe("exitEnrollment", () => {
  it("marks an enrollment EXITED with a reason", async () => {
    const prisma = fakePrisma({ enrollment: { id: "enrollment-1", status: "ACTIVE" } });
    const result = await exitEnrollment(prisma, "org-1", "campaign-1", "lead-1", "unsubscribed");
    expect(result?.status).toBe("EXITED");
    expect(result?.exitReason).toBe("unsubscribed");
  });
});
