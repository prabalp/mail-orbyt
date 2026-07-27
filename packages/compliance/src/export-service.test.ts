import { describe, expect, it, vi } from "vitest";
import { exportLeadData } from "./export-service";

function fakePrisma(lead: unknown) {
  return {
    lead: { findUnique: vi.fn().mockResolvedValue(lead) },
    researchFact: { findMany: vi.fn().mockResolvedValue([{ id: "fact-1" }]) },
    emailDraft: { findMany: vi.fn().mockResolvedValue([]) },
    campaignEnrollment: { findMany: vi.fn().mockResolvedValue([]) },
    conversation: { findMany: vi.fn().mockResolvedValue([]) },
    meeting: { findMany: vi.fn().mockResolvedValue([]) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("exportLeadData", () => {
  it("returns null for a lead in a different organisation", async () => {
    const prisma = fakePrisma({ id: "lead-1", organisationId: "org-attacker" });
    const result = await exportLeadData(prisma, "org-victim", "lead-1");
    expect(result).toBeNull();
  });

  it("bundles every related record and records a DATA_EXPORTED audit event", async () => {
    const prisma = fakePrisma({ id: "lead-1", organisationId: "org-1" });
    const result = await exportLeadData(prisma, "org-1", "lead-1", "user-1");
    expect(result?.researchFacts).toEqual([{ id: "fact-1" }]);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "DATA_EXPORTED", organisationId: "org-1" }),
      }),
    );
  });
});
