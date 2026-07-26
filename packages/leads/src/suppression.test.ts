import { describe, expect, it, vi } from "vitest";
import { addSuppressionEntry, isSuppressed } from "./suppression";

function fakePrisma(match: unknown = null) {
  return {
    suppressionEntry: {
      findFirst: vi.fn().mockResolvedValue(match),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
  };
}

describe("isSuppressed", () => {
  it("returns false when there is no matching entry", async () => {
    const prisma = fakePrisma(null);
    await expect(isSuppressed(prisma, "org-1", "jane@example.com")).resolves.toBe(false);
  });

  it("returns true when the exact email is suppressed", async () => {
    const prisma = fakePrisma({ id: "s1" });
    await expect(isSuppressed(prisma, "org-1", "Jane@Example.com")).resolves.toBe(true);
    expect(prisma.suppressionEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organisationId: "org-1",
          OR: expect.arrayContaining([{ type: "EMAIL", value: "jane@example.com" }]),
        }),
      }),
    );
  });

  it("also checks the sender's domain for a DOMAIN-level suppression", async () => {
    const prisma = fakePrisma(null);
    await isSuppressed(prisma, "org-1", "jane@blocked-domain.com");
    const callArgs = prisma.suppressionEntry.findFirst.mock.calls[0][0];
    expect(callArgs.where.OR).toContainEqual({ type: "DOMAIN", value: "blocked-domain.com" });
  });
});

describe("addSuppressionEntry", () => {
  it("upserts a normalized email suppression entry and records an audit event", async () => {
    const prisma = fakePrisma();
    await addSuppressionEntry(prisma, {
      organisationId: "org-1",
      type: "EMAIL",
      value: "Jane@Example.com",
      reason: "UNSUBSCRIBE",
      createdByUserId: "user-1",
    });

    expect(prisma.suppressionEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organisationId_type_value: {
            organisationId: "org-1",
            type: "EMAIL",
            value: "jane@example.com",
          },
        },
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "SUPPRESSION_CREATED" }) }),
    );
  });
});
