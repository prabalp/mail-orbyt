import { describe, expect, it, vi } from "vitest";
import { deleteLeadData } from "./deletion-service";

function fakePrisma(lead: unknown) {
  return {
    lead: {
      findUnique: vi.fn().mockResolvedValue(lead),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("deleteLeadData", () => {
  it("returns false for a lead in a different organisation, without deleting anything", async () => {
    const prisma = fakePrisma({ id: "lead-1", organisationId: "org-attacker" });
    const result = await deleteLeadData(prisma, "org-victim", "lead-1", "user-1");
    expect(result).toBe(false);
    expect(prisma.lead.delete).not.toHaveBeenCalled();
  });

  it("returns false for a nonexistent lead", async () => {
    const prisma = fakePrisma(null);
    const result = await deleteLeadData(prisma, "org-1", "missing", "user-1");
    expect(result).toBe(false);
  });

  it("deletes the lead and records a DATA_DELETED audit event", async () => {
    const prisma = fakePrisma({ id: "lead-1", organisationId: "org-1" });
    const result = await deleteLeadData(prisma, "org-1", "lead-1", "user-1");
    expect(result).toBe(true);
    expect(prisma.lead.delete).toHaveBeenCalledWith({ where: { id: "lead-1" } });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "DATA_DELETED", organisationId: "org-1" }),
      }),
    );
  });
});
