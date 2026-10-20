import { describe, expect, it, vi } from "vitest";
import { listActiveConnections, revokeConnection, revokeToken } from "./connections";
import { hashToken } from "@mail-orbyt/authentication";

describe("revokeToken", () => {
  it("revokes both the access and refresh token sharing a raw value", async () => {
    const prisma = {
      mcpAccessToken: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      mcpRefreshToken: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const rawToken = "some-raw-token";

    await revokeToken(prisma, rawToken);

    expect(prisma.mcpAccessToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken(rawToken) },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.mcpRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken(rawToken) },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("listActiveConnections", () => {
  it("de-duplicates by client + organisation, keeping the most recent", async () => {
    const prisma = {
      mcpRefreshToken: {
        findMany: vi.fn().mockResolvedValue([
          {
            clientId: "client-row-1",
            organisationId: "org-1",
            scope: "profile leads:manage",
            createdAt: new Date("2026-08-01"),
            client: { clientId: "mcp_abc", clientName: "Claude" },
          },
          {
            clientId: "client-row-1",
            organisationId: "org-1",
            scope: "profile",
            createdAt: new Date("2026-07-01"),
            client: { clientId: "mcp_abc", clientName: "Claude" },
          },
        ]),
      },
    };

    const connections = await listActiveConnections(prisma, { userId: "user-1" });

    expect(connections).toHaveLength(1);
    expect(connections[0]).toEqual({
      clientId: "mcp_abc",
      clientName: "Claude",
      organisationId: "org-1",
      scope: "profile leads:manage",
      createdAt: new Date("2026-08-01"),
    });
  });
});

describe("revokeConnection", () => {
  it("revokes tokens for the given user/client/organisation and the platform grant behind them", async () => {
    const prisma = {
      mcpOAuthClient: {
        findUnique: vi.fn().mockResolvedValue({ id: "client-row-1", clientId: "mcp_abc" }),
      },
      mcpAccessToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mcpRefreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mcpPlatformGrant: {
        findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    };

    await revokeConnection(prisma, {
      userId: "user-1",
      clientId: "mcp_abc",
      organisationId: "org-1",
    });

    const expectedWhere = {
      userId: "user-1",
      clientId: "client-row-1",
      organisationId: "org-1",
      revokedAt: null,
    };
    expect(prisma.mcpAccessToken.updateMany).toHaveBeenCalledWith({
      where: expectedWhere,
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.mcpRefreshToken.updateMany).toHaveBeenCalledWith({
      where: expectedWhere,
      data: { revokedAt: expect.any(Date) },
    });
    // The grant itself gets revoked too, so a later reconnect doesn't silently skip consent.
    expect(prisma.mcpPlatformGrant.updateMany).toHaveBeenCalledWith({
      where: { id: "grant-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // ...and every token exchanged under that grant (not just ones matching the direct user/client/org filter above).
    expect(prisma.mcpAccessToken.updateMany).toHaveBeenCalledWith({
      where: { platformGrantId: "grant-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.mcpRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { platformGrantId: "grant-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("skips the platform-grant cascade when there is no active grant", async () => {
    const prisma = {
      mcpOAuthClient: {
        findUnique: vi.fn().mockResolvedValue({ id: "client-row-1", clientId: "mcp_abc" }),
      },
      mcpAccessToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      mcpRefreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      mcpPlatformGrant: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn() },
      auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    };

    await revokeConnection(prisma, {
      userId: "user-1",
      clientId: "mcp_abc",
      organisationId: "org-1",
    });

    expect(prisma.mcpPlatformGrant.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when the client id is unknown", async () => {
    const prisma = {
      mcpOAuthClient: { findUnique: vi.fn().mockResolvedValue(null) },
      mcpAccessToken: { updateMany: vi.fn() },
      mcpRefreshToken: { updateMany: vi.fn() },
      mcpPlatformGrant: { findFirst: vi.fn(), updateMany: vi.fn() },
    };

    await revokeConnection(prisma, {
      userId: "user-1",
      clientId: "unknown",
      organisationId: "org-1",
    });

    expect(prisma.mcpAccessToken.updateMany).not.toHaveBeenCalled();
  });
});
