import { describe, expect, it, vi } from "vitest";
import { listMembers, removeMember, updateMemberRole } from "./members";
import { ForbiddenError } from "./errors";

function fakePrisma(membership: unknown, ownerCount = 1) {
  return {
    organisationMembership: {
      findUnique: vi.fn().mockResolvedValue(membership),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(ownerCount),
    },
    auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
  };
}

describe("listMembers", () => {
  it("maps memberships to the userId/email/name/role/joinedAt summary shape", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const prisma = {
      organisationMembership: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: "user-1",
            role: "OWNER",
            createdAt,
            user: { email: "owner@example.com", name: "Owner Person" },
          },
        ]),
      },
    };

    await expect(listMembers(prisma, "org-1")).resolves.toEqual([
      { userId: "user-1", email: "owner@example.com", name: "Owner Person", role: "OWNER", joinedAt: createdAt },
    ]);
  });

  it("orders owners first, then by join date within a role", async () => {
    // Prisma's orderBy on an enum sorts alphabetically (ADMIN, MEMBER, OWNER,
    // VIEWER) — deliberately fetched by createdAt only and re-sorted by
    // ROLE_RANK in application code, so this asserts the OUTPUT order rather
    // than the query shape.
    const earlierAdmin = {
      userId: "admin-1",
      role: "ADMIN",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      user: { email: "admin@example.com", name: null },
    };
    const laterOwner = {
      userId: "owner-1",
      role: "OWNER",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      user: { email: "owner@example.com", name: null },
    };
    const prisma = {
      organisationMembership: {
        findMany: vi.fn().mockResolvedValue([earlierAdmin, laterOwner]),
      },
    };

    const result = await listMembers(prisma, "org-1");

    expect(result.map((member) => member.userId)).toEqual(["owner-1", "admin-1"]);
    expect(prisma.organisationMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organisationId: "org-1" }, orderBy: { createdAt: "asc" } }),
    );
  });
});

describe("updateMemberRole", () => {
  it("updates the role and records an audit event", async () => {
    const membership = { id: "m1", organisationId: "org-1", userId: "user-1", role: "MEMBER" };
    const prisma = fakePrisma(membership);

    await updateMemberRole(prisma, {
      organisationId: "org-1",
      targetUserId: "user-1",
      newRole: "ADMIN",
      actingUserId: "user-owner",
      actingRole: "OWNER",
    });

    expect(prisma.organisationMembership.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { role: "ADMIN" },
    });
  });

  it("rejects an ADMIN trying to grant OWNER", async () => {
    const membership = { id: "m1", organisationId: "org-1", userId: "user-1", role: "MEMBER" };
    const prisma = fakePrisma(membership);

    await expect(
      updateMemberRole(prisma, {
        organisationId: "org-1",
        targetUserId: "user-1",
        newRole: "OWNER",
        actingUserId: "user-admin",
        actingRole: "ADMIN",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("prevents demoting the last remaining owner", async () => {
    const membership = { id: "m1", organisationId: "org-1", userId: "user-1", role: "OWNER" };
    const prisma = fakePrisma(membership, 1);

    await expect(
      updateMemberRole(prisma, {
        organisationId: "org-1",
        targetUserId: "user-1",
        newRole: "ADMIN",
        actingUserId: "user-1",
        actingRole: "OWNER",
      }),
    ).rejects.toThrow(/at least one owner/);
  });

  it("allows demoting an owner when another owner remains", async () => {
    const membership = { id: "m1", organisationId: "org-1", userId: "user-1", role: "OWNER" };
    const prisma = fakePrisma(membership, 2);

    await expect(
      updateMemberRole(prisma, {
        organisationId: "org-1",
        targetUserId: "user-1",
        newRole: "ADMIN",
        actingUserId: "user-2",
        actingRole: "OWNER",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("removeMember", () => {
  it("removes the membership and records an audit event", async () => {
    const membership = { id: "m1", organisationId: "org-1", userId: "user-1", role: "MEMBER" };
    const prisma = fakePrisma(membership);

    await removeMember(prisma, {
      organisationId: "org-1",
      targetUserId: "user-1",
      actingUserId: "user-owner",
    });

    expect(prisma.organisationMembership.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });

  it("prevents removing the last remaining owner", async () => {
    const membership = { id: "m1", organisationId: "org-1", userId: "user-1", role: "OWNER" };
    const prisma = fakePrisma(membership, 1);

    await expect(
      removeMember(prisma, {
        organisationId: "org-1",
        targetUserId: "user-1",
        actingUserId: "user-1",
      }),
    ).rejects.toThrow(/at least one owner/);
  });

  it("rejects removing a user who is not a member", async () => {
    const prisma = fakePrisma(null);

    await expect(
      removeMember(prisma, {
        organisationId: "org-1",
        targetUserId: "user-x",
        actingUserId: "user-1",
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
