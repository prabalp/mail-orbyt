import { describe, expect, it, vi } from "vitest";
import {
  addSuppressionEntry,
  checkSuppression,
  isSuppressed,
  listSuppressionEntries,
  removeSuppressionEntry,
} from "./suppression";

function fakePrisma(match: unknown = null) {
  return {
    suppressionEntry: {
      findFirst: vi.fn().mockResolvedValue(match),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      upsert: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
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

describe("listSuppressionEntries", () => {
  it("paginates and reports totalCount alongside the page", async () => {
    const entry = {
      id: "s1",
      type: "EMAIL",
      value: "a@b.com",
      reason: "MANUAL_DO_NOT_CONTACT",
      note: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    const prisma = fakePrisma();
    prisma.suppressionEntry.findMany.mockResolvedValue([entry]);
    prisma.suppressionEntry.count.mockResolvedValue(1);

    await expect(
      listSuppressionEntries(prisma, { organisationId: "org-1", page: 1, pageSize: 25 }),
    ).resolves.toEqual({ entries: [entry], totalCount: 1 });
  });

  it("filters by type and a lowercased search term", async () => {
    const prisma = fakePrisma();

    await listSuppressionEntries(prisma, {
      organisationId: "org-1",
      type: "DOMAIN",
      search: "Blocked.Com",
      page: 1,
      pageSize: 25,
    });

    expect(prisma.suppressionEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organisationId: "org-1",
          type: "DOMAIN",
          value: { contains: "blocked.com", mode: "insensitive" },
        },
      }),
    );
  });
});

describe("removeSuppressionEntry", () => {
  it("normalizes the value, deletes, and records an audit event when something was removed", async () => {
    const prisma = fakePrisma();
    prisma.suppressionEntry.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      removeSuppressionEntry(prisma, {
        organisationId: "org-1",
        type: "EMAIL",
        value: "Jane@Example.com",
        actingUserId: "user-1",
      }),
    ).resolves.toBe(true);

    expect(prisma.suppressionEntry.deleteMany).toHaveBeenCalledWith({
      where: { organisationId: "org-1", type: "EMAIL", value: "jane@example.com" },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "SUPPRESSION_REMOVED" }) }),
    );
  });

  it("returns false and records no audit event when nothing matched", async () => {
    const prisma = fakePrisma();
    prisma.suppressionEntry.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      removeSuppressionEntry(prisma, {
        organisationId: "org-1",
        type: "EMAIL",
        value: "nobody@example.com",
      }),
    ).resolves.toBe(false);
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });
});

describe("checkSuppression", () => {
  it("reports not suppressed when there is no match", async () => {
    const prisma = fakePrisma(null);
    await expect(checkSuppression(prisma, "org-1", "jane@example.com")).resolves.toEqual({
      suppressed: false,
    });
  });

  it("reports the matching entry when the address is suppressed", async () => {
    const match = {
      id: "s1",
      type: "EMAIL",
      value: "jane@example.com",
      reason: "HARD_BOUNCE",
      note: "bounced twice",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    const prisma = fakePrisma(match);

    await expect(checkSuppression(prisma, "org-1", "Jane@Example.com")).resolves.toEqual({
      suppressed: true,
      matchedBy: match,
    });
  });
});
