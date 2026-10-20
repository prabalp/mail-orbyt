import { describe, expect, it, vi } from "vitest";
import { hashToken } from "@mail-orbyt/authentication";
import { verifyAccessToken } from "./verify";

describe("verifyAccessToken", () => {
  it("returns null for an empty token", async () => {
    const prisma = { mcpAccessToken: { findUnique: vi.fn() } };
    expect(await verifyAccessToken(prisma, "")).toBeNull();
    expect(prisma.mcpAccessToken.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when no token row matches", async () => {
    const prisma = { mcpAccessToken: { findUnique: vi.fn().mockResolvedValue(null) } };
    expect(await verifyAccessToken(prisma, "raw-token")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const prisma = {
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          clientId: "client-1",
          revokedAt: null,
          expiresAt: new Date(Date.now() - 1000),
        }),
      },
    };
    expect(await verifyAccessToken(prisma, "raw-token")).toBeNull();
  });

  it("returns null for a revoked token", async () => {
    const prisma = {
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          clientId: "client-1",
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    expect(await verifyAccessToken(prisma, "raw-token")).toBeNull();
  });

  it("resolves the actor for a valid, unexpired token", async () => {
    const rawToken = "raw-token";
    const prisma = {
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile leads:manage",
          clientId: "client-1",
          resource: "urn:orbyt:mail-orbyt-mcp-server",
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };

    const result = await verifyAccessToken(prisma, rawToken);
    expect(result).toEqual({
      userId: "user-1",
      organisationId: "org-1",
      scope: "profile leads:manage",
      clientId: "client-1",
      resource: "urn:orbyt:mail-orbyt-mcp-server",
    });
    expect(prisma.mcpAccessToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken(rawToken) },
    });
  });
});
