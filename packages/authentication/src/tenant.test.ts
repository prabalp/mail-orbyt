import { describe, expect, it, vi } from "vitest";
import { requireOrganisationMembership } from "./tenant";
import { ForbiddenError } from "./errors";

function fakePrisma(membership: unknown) {
  return {
    organisationMembership: {
      findUnique: vi.fn().mockResolvedValue(membership),
    },
  };
}

describe("requireOrganisationMembership", () => {
  it("returns the membership when the user belongs to the organisation", async () => {
    const membership = { id: "m1", organisationId: "org-1", userId: "user-1", role: "MEMBER" };
    const prisma = fakePrisma(membership);

    const result = await requireOrganisationMembership(prisma, {
      userId: "user-1",
      organisationId: "org-1",
    });

    expect(result).toBe(membership);
    expect(prisma.organisationMembership.findUnique).toHaveBeenCalledWith({
      where: { organisationId_userId: { organisationId: "org-1", userId: "user-1" } },
    });
  });

  it("throws ForbiddenError when there is no membership row for the claimed organisation", async () => {
    const prisma = fakePrisma(null);

    await expect(
      requireOrganisationMembership(prisma, {
        userId: "user-1",
        organisationId: "org-attacker-supplied",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError when the member lacks the required permission", async () => {
    const membership = { id: "m1", organisationId: "org-1", userId: "user-1", role: "VIEWER" };
    const prisma = fakePrisma(membership);

    await expect(
      requireOrganisationMembership(prisma, {
        userId: "user-1",
        organisationId: "org-1",
        permission: "leads:manage",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("succeeds when the member has the required permission", async () => {
    const membership = { id: "m1", organisationId: "org-1", userId: "user-1", role: "ADMIN" };
    const prisma = fakePrisma(membership);

    await expect(
      requireOrganisationMembership(prisma, {
        userId: "user-1",
        organisationId: "org-1",
        permission: "campaigns:manage",
      }),
    ).resolves.toBe(membership);
  });

  it("never trusts the organisationId alone — a membership in a different org does not satisfy the check", async () => {
    // Simulates the exact attack this function exists to prevent: a client
    // sends organisationId "org-victim" while only being a member of
    // "org-attacker". The DB lookup is scoped to the composite key, so a
    // membership row for a different org simply won't be found.
    const prisma = fakePrisma(null);

    await expect(
      requireOrganisationMembership(prisma, { userId: "user-1", organisationId: "org-victim" }),
    ).rejects.toThrow(ForbiddenError);
  });
});
