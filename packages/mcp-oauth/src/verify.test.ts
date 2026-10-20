import { describe, expect, it, vi } from "vitest";
import { hashToken } from "@mail-orbyt/authentication";
import { verifyAccessToken } from "./verify";
import { MAIL_ORBYT_MCP_RESOURCE_URI as RES } from "./constants";

describe("verifyAccessToken", () => {
  it("returns null for an empty token", async () => {
    const prisma = { mcpAccessToken: { findUnique: vi.fn() } };
    expect(await verifyAccessToken(prisma, "", RES)).toBeNull();
    expect(prisma.mcpAccessToken.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when no token row matches", async () => {
    const prisma = { mcpAccessToken: { findUnique: vi.fn().mockResolvedValue(null) } };
    expect(await verifyAccessToken(prisma, "raw-token", RES)).toBeNull();
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
    expect(await verifyAccessToken(prisma, "raw-token", RES)).toBeNull();
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
    expect(await verifyAccessToken(prisma, "raw-token", RES)).toBeNull();
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
          resource: RES,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };

    const result = await verifyAccessToken(prisma, rawToken, RES);
    expect(result).toEqual({
      userId: "user-1",
      organisationId: "org-1",
      scope: "profile leads:manage",
      clientId: "client-1",
      resource: RES,
    });
    expect(prisma.mcpAccessToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken(rawToken) },
    });
  });

  it("rejects a token minted for a different audience (audience mismatch)", async () => {
    const prisma = {
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          clientId: "client-1",
          resource: "urn:orbyt:lead-orbyt-mcp-server",
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    expect(await verifyAccessToken(prisma, "raw-token", RES)).toBeNull();
    expect(
      await verifyAccessToken(prisma, "raw-token", "urn:orbyt:lead-orbyt-mcp-server"),
    ).not.toBeNull();
  });
});
