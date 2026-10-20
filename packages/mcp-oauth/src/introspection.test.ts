import { describe, expect, it, vi } from "vitest";
import { hashToken } from "@mail-orbyt/authentication";
import { introspectToken } from "./introspection";

describe("introspectToken", () => {
  it("returns active: false for an empty token", async () => {
    const prisma = { mcpAccessToken: { findUnique: vi.fn() } };
    expect(await introspectToken(prisma, "")).toEqual({ active: false });
    expect(prisma.mcpAccessToken.findUnique).not.toHaveBeenCalled();
  });

  it("returns active: false when no token row matches", async () => {
    const prisma = { mcpAccessToken: { findUnique: vi.fn().mockResolvedValue(null) } };
    expect(await introspectToken(prisma, "raw-token")).toEqual({ active: false });
  });

  it("returns active: false for a revoked token", async () => {
    const prisma = {
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          resource: "urn:orbyt:lead-orbyt-mcp-server",
          client: { clientId: "mcp_gateway" },
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    expect(await introspectToken(prisma, "raw-token")).toEqual({ active: false });
  });

  it("returns active: false for an expired token", async () => {
    const prisma = {
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          resource: "urn:orbyt:lead-orbyt-mcp-server",
          client: { clientId: "mcp_gateway" },
          revokedAt: null,
          expiresAt: new Date(Date.now() - 1000),
        }),
      },
    };
    expect(await introspectToken(prisma, "raw-token")).toEqual({ active: false });
  });

  it("returns the RFC 7662 fields for a valid token", async () => {
    const rawToken = "raw-token";
    const expiresAt = new Date(Date.now() + 60_000);
    const prisma = {
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile leads:manage",
          resource: "urn:orbyt:lead-orbyt-mcp-server",
          client: { clientId: "mcp_gateway" },
          revokedAt: null,
          expiresAt,
        }),
      },
    };

    expect(await introspectToken(prisma, rawToken)).toEqual({
      active: true,
      sub: "user-1",
      organisation_id: "org-1",
      scope: "profile leads:manage",
      aud: "urn:orbyt:lead-orbyt-mcp-server",
      client_id: "mcp_gateway",
      exp: Math.floor(expiresAt.getTime() / 1000),
      token_type: "Bearer",
    });
    expect(prisma.mcpAccessToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken(rawToken) },
      include: { client: { select: { clientId: true } } },
    });
  });
});
