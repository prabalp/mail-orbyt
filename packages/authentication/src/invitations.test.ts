import { describe, expect, it, vi } from "vitest";
import { acceptInvitation, createInvitation, revokeInvitation } from "./invitations";
import { ForbiddenError } from "./errors";
import { hashToken } from "./tokens";

function fakePrisma(overrides: Record<string, unknown> = {}) {
  const tx = {
    invitation: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockImplementation(({ data }) => ({ id: "inv-1", ...data })),
      update: vi.fn().mockResolvedValue(undefined),
      findUnique: vi.fn(),
    },
    organisationMembership: {
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
  return {
    ...tx,
    $transaction: vi
      .fn()
      .mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx)),
  };
}

describe("createInvitation", () => {
  it("revokes any prior pending invitation and creates a new one", async () => {
    const prisma = fakePrisma();

    const { invitation, rawToken } = await createInvitation(prisma, {
      organisationId: "org-1",
      email: "New.Member@Example.com",
      role: "MEMBER",
      invitedByUserId: "user-owner",
    });

    expect(prisma.invitation.updateMany).toHaveBeenCalledWith({
      where: { organisationId: "org-1", email: "new.member@example.com", status: "PENDING" },
      data: { status: "REVOKED" },
    });
    expect(invitation.email).toBe("new.member@example.com");
    expect(invitation.token).toBe(hashToken(rawToken));
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "INVITATION_SENT" }) }),
    );
  });
});

describe("acceptInvitation", () => {
  it("creates a membership and marks the invitation accepted", async () => {
    const rawToken = "raw-token-value";
    const invitation = {
      id: "inv-1",
      organisationId: "org-1",
      email: "member@example.com",
      role: "MEMBER",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
    };
    const prisma = fakePrisma({
      invitation: {
        findUnique: vi.fn().mockResolvedValue(invitation),
        update: vi.fn().mockResolvedValue(undefined),
      },
    });

    await acceptInvitation(prisma, {
      rawToken,
      acceptingUserId: "user-1",
      acceptingUserEmail: "Member@Example.com",
    });

    expect(prisma.organisationMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organisationId_userId: { organisationId: "org-1", userId: "user-1" } },
        create: { organisationId: "org-1", userId: "user-1", role: "MEMBER" },
      }),
    );
    expect(prisma.invitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "ACCEPTED" },
    });
  });

  it("rejects when the token does not match any invitation", async () => {
    const prisma = fakePrisma({ invitation: { findUnique: vi.fn().mockResolvedValue(null) } });

    await expect(
      acceptInvitation(prisma, {
        rawToken: "bad-token",
        acceptingUserId: "user-1",
        acceptingUserEmail: "member@example.com",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects and marks EXPIRED when the invitation's expiry has passed", async () => {
    const invitation = {
      id: "inv-1",
      organisationId: "org-1",
      email: "member@example.com",
      role: "MEMBER",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 60_000),
    };
    const update = vi.fn().mockResolvedValue(undefined);
    const prisma = fakePrisma({
      invitation: { findUnique: vi.fn().mockResolvedValue(invitation), update },
    });

    await expect(
      acceptInvitation(prisma, {
        rawToken: "raw",
        acceptingUserId: "user-1",
        acceptingUserEmail: "member@example.com",
      }),
    ).rejects.toThrow(/expired/);

    expect(update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "EXPIRED" } });
  });

  it("rejects when the accepting user's email does not match the invited email", async () => {
    const invitation = {
      id: "inv-1",
      organisationId: "org-1",
      email: "member@example.com",
      role: "MEMBER",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
    };
    const prisma = fakePrisma({
      invitation: { findUnique: vi.fn().mockResolvedValue(invitation) },
    });

    await expect(
      acceptInvitation(prisma, {
        rawToken: "raw",
        acceptingUserId: "user-attacker",
        acceptingUserEmail: "attacker@example.com",
      }),
    ).rejects.toThrow(/different email/);
  });

  it("rejects an already-accepted invitation (no replay)", async () => {
    const invitation = {
      id: "inv-1",
      organisationId: "org-1",
      email: "member@example.com",
      role: "MEMBER",
      status: "ACCEPTED",
      expiresAt: new Date(Date.now() + 60_000),
    };
    const prisma = fakePrisma({
      invitation: { findUnique: vi.fn().mockResolvedValue(invitation) },
    });

    await expect(
      acceptInvitation(prisma, {
        rawToken: "raw",
        acceptingUserId: "user-1",
        acceptingUserEmail: "member@example.com",
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("revokeInvitation", () => {
  it("marks the invitation revoked and records an audit event", async () => {
    const prisma = fakePrisma();
    await revokeInvitation(prisma, {
      invitationId: "inv-1",
      revokedByUserId: "user-owner",
      organisationId: "org-1",
    });

    expect(prisma.invitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "REVOKED" },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "INVITATION_REVOKED" }) }),
    );
  });
});
