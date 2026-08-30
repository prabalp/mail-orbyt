import { describe, expect, it, vi } from "vitest";
import {
  createOrganisation,
  deleteOrganisation,
  OrganisationNameMismatchError,
  slugify,
} from "./organisations";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Acme Inc")).toBe("acme-inc");
  });

  it("strips accents", () => {
    expect(slugify("Café René")).toBe("cafe-rene");
  });

  it("collapses repeated separators and trims leading/trailing hyphens", () => {
    expect(slugify("  Acme -- Inc!! ")).toBe("acme-inc");
  });
});

function fakePrisma(existingSlugs: Set<string>) {
  const tx = {
    organisation: {
      findUnique: vi
        .fn()
        .mockImplementation(({ where }: { where: { slug: string } }) =>
          existingSlugs.has(where.slug) ? { id: "existing", slug: where.slug } : null,
        ),
      create: vi.fn().mockImplementation(({ data }) => ({ id: "org-1", ...data })),
    },
    organisationMembership: {
      create: vi.fn().mockResolvedValue(undefined),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  };
  return {
    ...tx,
    $transaction: vi
      .fn()
      .mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx)),
  };
}

describe("createOrganisation", () => {
  it("creates the organisation and an OWNER membership together", async () => {
    const prisma = fakePrisma(new Set());

    const org = await createOrganisation(prisma, { name: "Acme Inc", ownerUserId: "user-1" });

    expect(org.slug).toBe("acme-inc");
    expect(prisma.organisationMembership.create).toHaveBeenCalledWith({
      data: { organisationId: "org-1", userId: "user-1", role: "OWNER" },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "ORGANISATION_CREATED" }) }),
    );
  });

  it("appends a numeric suffix when the slug is already taken", async () => {
    const prisma = fakePrisma(new Set(["acme-inc"]));

    const org = await createOrganisation(prisma, { name: "Acme Inc", ownerUserId: "user-1" });

    expect(org.slug).toBe("acme-inc-2");
  });
});

function fakeDeletionPrisma(organisation: { id: string; name: string; slug: string } | null) {
  return {
    organisation: {
      findUnique: vi.fn().mockResolvedValue(organisation),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
  };
}

describe("deleteOrganisation", () => {
  it("deletes the organisation and records an audit event without organisationId", async () => {
    const prisma = fakeDeletionPrisma({ id: "org-1", name: "Acme Inc", slug: "acme-inc" });

    const result = await deleteOrganisation(prisma, {
      organisationId: "org-1",
      confirmName: "Acme Inc",
      deletedByUserId: "user-1",
    });

    expect(result).toBe(true);
    expect(prisma.organisation.delete).toHaveBeenCalledWith({ where: { id: "org-1" } });

    const auditCall = prisma.auditEvent.create.mock.calls[0][0];
    expect(auditCall.data.type).toBe("ORGANISATION_DELETED");
    expect(auditCall.data.userId).toBe("user-1");
    // Must NOT set organisationId: AuditEvent's own FK to Organisation is
    // onDelete: Cascade, so a row referencing the org being deleted would
    // vanish along with it in the same transaction.
    expect(auditCall.data.organisationId).toBeUndefined();
    expect(auditCall.data.metadata).toEqual(
      expect.objectContaining({ organisationId: "org-1", organisationName: "Acme Inc" }),
    );
  });

  it("rejects a confirmName that doesn't match, without deleting anything", async () => {
    const prisma = fakeDeletionPrisma({ id: "org-1", name: "Acme Inc", slug: "acme-inc" });

    await expect(
      deleteOrganisation(prisma, {
        organisationId: "org-1",
        confirmName: "wrong name",
        deletedByUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(OrganisationNameMismatchError);

    expect(prisma.organisation.delete).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("returns false for a nonexistent organisation", async () => {
    const prisma = fakeDeletionPrisma(null);

    await expect(
      deleteOrganisation(prisma, {
        organisationId: "nonexistent",
        confirmName: "anything",
        deletedByUserId: "user-1",
      }),
    ).resolves.toBe(false);
  });
});
