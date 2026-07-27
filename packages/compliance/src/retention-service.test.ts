import { describe, expect, it, vi } from "vitest";
import { purgeStaleData } from "./retention-service";

describe("purgeStaleData", () => {
  it("only deletes DISCARDED drafts and old import rows, scoped to the organisation", async () => {
    const prisma = {
      emailDraft: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      importRow: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
    };

    const result = await purgeStaleData(prisma, "org-1", 30);

    expect(result).toEqual({ discardedDraftsDeleted: 2, importRowsDeleted: 5 });
    expect(prisma.emailDraft.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organisationId: "org-1", status: "DISCARDED" }),
      }),
    );
    expect(prisma.importRow.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ importBatch: { organisationId: "org-1" } }),
      }),
    );
  });

  it("uses a cutoff date retentionDays in the past", async () => {
    const prisma = {
      emailDraft: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      importRow: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };

    await purgeStaleData(prisma, "org-1", 10);

    const call = prisma.emailDraft.deleteMany.mock.calls[0]![0];
    const cutoff = call.where.updatedAt.lt as Date;
    const expected = Date.now() - 10 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(5000);
  });
});
