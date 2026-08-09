import { describe, expect, it, vi } from "vitest";
import { deleteLeadData, deleteLeadsData } from "./deletion-service";

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

function fakeBulkPrisma(deletedCount = 0) {
  return {
    lead: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: deletedCount }),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("deleteLeadsData", () => {
  it("scopes the delete by organisationId as well as the given IDs", async () => {
    const prisma = fakeBulkPrisma(2);
    await deleteLeadsData(prisma, "org-1", ["lead-1", "lead-2"], "user-1");
    expect(prisma.lead.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["lead-1", "lead-2"] }, organisationId: "org-1" },
    });
  });

  it("is a no-op for an empty selection — no delete, no audit noise", async () => {
    const prisma = fakeBulkPrisma();
    const deleted = await deleteLeadsData(prisma, "org-1", [], "user-1");
    expect(deleted).toBe(0);
    expect(prisma.lead.deleteMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("chunks large selections and returns the summed count", async () => {
    const prisma = fakeBulkPrisma(1000);
    const leadIds = Array.from({ length: 2500 }, (_, index) => `lead-${index}`);
    const deleted = await deleteLeadsData(prisma, "org-1", leadIds, "user-1");
    // 2500 IDs at 1000 per statement -> three statements.
    expect(prisma.lead.deleteMany).toHaveBeenCalledTimes(3);
    expect(deleted).toBe(3000);
  });

  it("records exactly one DATA_DELETED audit event for the whole operation", async () => {
    const prisma = fakeBulkPrisma(2);
    await deleteLeadsData(prisma, "org-1", ["lead-1", "lead-2"], "user-1");
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "DATA_DELETED", organisationId: "org-1" }),
      }),
    );
  });
});
