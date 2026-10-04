import { describe, expect, it, vi } from "vitest";
import { listActiveConnections, revokeConnection, revokeToken } from "./connections";
import { hashToken } from "@mail-orbyt/authentication";

describe("revokeToken", () => {
  it("revokes both the access and refresh token sharing a raw value", async () => {
    const prisma = {
      mcpAccessToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mcpRefreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
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
  it("revokes only tokens for the given user/client/organisation", async () => {
    const prisma = {
      mcpOAuthClient: {
        findUnique: vi.fn().mockResolvedValue({ id: "client-row-1", clientId: "mcp_abc" }),
      },
      mcpAccessToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mcpRefreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mcpPlatformGrant: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },
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
  });

  it("does nothing when the client id is unknown", async () => {
    const prisma = {
      mcpOAuthClient: { findUnique: vi.fn().mockResolvedValue(null) },
      mcpAccessToken: { updateMany: vi.fn() },
      mcpRefreshToken: { updateMany: vi.fn() },
      mcpPlatformGrant: { findMany: vi.fn(), updateMany: vi.fn() },
    };

    await revokeConnection(prisma, {
      userId: "user-1",
      clientId: "unknown",
      organisationId: "org-1",
    });

    expect(prisma.mcpAccessToken.updateMany).not.toHaveBeenCalled();
  });

  it("cascades: revokes the platform grant and every token derived under it", async () => {
    const prisma = {
      mcpOAuthClient: {
        findUnique: vi.fn().mockResolvedValue({ id: "client-row-1", clientId: "mcp_abc" }),
      },
      mcpAccessToken: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      mcpRefreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mcpPlatformGrant: {
        findMany: vi.fn().mockResolvedValue([{ id: "grant-1" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await revokeConnection(prisma, {
      userId: "user-1",
      clientId: "mcp_abc",
      organisationId: "org-1",
    });

    expect(prisma.mcpPlatformGrant.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["grant-1"] } },
      data: { revokedAt: expect.any(Date) },
    });
    const derived = { platformGrantId: { in: ["grant-1"] }, revokedAt: null };
    expect(prisma.mcpAccessToken.updateMany).toHaveBeenCalledWith({
      where: derived,
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.mcpRefreshToken.updateMany).toHaveBeenCalledWith({
      where: derived,
      data: { revokedAt: expect.any(Date) },
    });
  });
});
