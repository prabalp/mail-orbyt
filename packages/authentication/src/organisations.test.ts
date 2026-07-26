import { describe, expect, it, vi } from "vitest";
import { createOrganisation, slugify } from "./organisations";

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
