import { describe, expect, it, vi } from "vitest";
import { hashToken } from "@mail-orbyt/authentication";
import { exchangeTokenForResource } from "./exchange";
import { OAuthGrantError } from "./errors";

const CLIENT_ROW = { id: "client-row-1", clientId: "mcp_gateway", clientName: "Orbyt Gateway" };

function fakePrisma(overrides: Record<string, unknown> = {}) {
  return {
    mcpOAuthClient: { findUnique: vi.fn().mockResolvedValue(CLIENT_ROW) },
    mcpAccessToken: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue(undefined),
    },
    mcpResource: {
      findUnique: vi.fn().mockResolvedValue({
        resourceUri: "urn:orbyt:lead-orbyt-mcp-server",
        displayName: "Lead Orbyt",
        backendKind: "NATIVE_INTROSPECTED",
      }),
    },
    organisationMembership: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ organisationId: "org-1", userId: "user-1", role: "ADMIN" }),
    },
    mcpPlatformGrant: {
      findFirst: vi.fn().mockResolvedValue({ id: "grant-1", scope: "profile leads:manage" }),
      upsert: vi.fn(),
    },
    ...overrides,
  };
}

describe("exchangeTokenForResource", () => {
  it("mints a short-TTL, resource-audienced access token with no refresh token", async () => {
    const rawSubjectToken = "raw-platform-token";
    const prisma = fakePrisma({
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "token-1",
          tokenHash: hashToken(rawSubjectToken),
          clientId: CLIENT_ROW.id,
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile leads:manage",
          resource: "https://gateway.orbyt.example/mcp",
          platformGrantId: "grant-1",
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        create: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await exchangeTokenForResource(prisma, {
      clientId: CLIENT_ROW.clientId,
      subjectToken: rawSubjectToken,
      resource: "urn:orbyt:lead-orbyt-mcp-server",
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.resource).toBe("urn:orbyt:lead-orbyt-mcp-server");
    expect(result.scope).toBe("profile leads:manage");
    expect(result).not.toHaveProperty("refreshToken");
    expect(prisma.mcpAccessToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resource: "urn:orbyt:lead-orbyt-mcp-server",
          platformGrantId: "grant-1",
        }),
      }),
    );
  });

  it("never grants more scope than the subject token itself held", async () => {
    const rawSubjectToken = "raw-platform-token";
    const prisma = fakePrisma({
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "token-1",
          tokenHash: hashToken(rawSubjectToken),
          clientId: CLIENT_ROW.id,
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile", // narrower than what the current ADMIN role would otherwise grant
          resource: "https://gateway.orbyt.example/mcp",
          platformGrantId: "grant-1",
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        create: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await exchangeTokenForResource(prisma, {
      clientId: CLIENT_ROW.clientId,
      subjectToken: rawSubjectToken,
      resource: "urn:orbyt:lead-orbyt-mcp-server",
    });

    expect(result.scope).toBe("profile");
  });

  it("rejects an unknown/unregistered resource", async () => {
    const rawSubjectToken = "raw-platform-token";
    const prisma = fakePrisma({
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "token-1",
          tokenHash: hashToken(rawSubjectToken),
          clientId: CLIENT_ROW.id,
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          resource: "https://gateway.orbyt.example/mcp",
          platformGrantId: "grant-1",
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      mcpResource: { findUnique: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      exchangeTokenForResource(prisma, {
        clientId: CLIENT_ROW.clientId,
        subjectToken: rawSubjectToken,
        resource: "urn:orbyt:some-unregistered-server",
      }),
    ).rejects.toThrow(OAuthGrantError);
  });

  it("rejects an expired subject token", async () => {
    const rawSubjectToken = "raw-platform-token";
    const prisma = fakePrisma({
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "token-1",
          tokenHash: hashToken(rawSubjectToken),
          clientId: CLIENT_ROW.id,
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          resource: "https://gateway.orbyt.example/mcp",
          platformGrantId: "grant-1",
          revokedAt: null,
          expiresAt: new Date(Date.now() - 1000),
        }),
      },
    });

    await expect(
      exchangeTokenForResource(prisma, {
        clientId: CLIENT_ROW.clientId,
        subjectToken: rawSubjectToken,
        resource: "urn:orbyt:lead-orbyt-mcp-server",
      }),
    ).rejects.toThrow(OAuthGrantError);
  });

  it("rejects a subject token presented by a different client", async () => {
    const rawSubjectToken = "raw-platform-token";
    const prisma = fakePrisma({
      mcpAccessToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "token-1",
          tokenHash: hashToken(rawSubjectToken),
          clientId: "some-other-client-row",
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          resource: "https://gateway.orbyt.example/mcp",
          platformGrantId: "grant-1",
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    });

    await expect(
      exchangeTokenForResource(prisma, {
        clientId: CLIENT_ROW.clientId,
        subjectToken: rawSubjectToken,
        resource: "urn:orbyt:lead-orbyt-mcp-server",
      }),
    ).rejects.toThrow(OAuthGrantError);
  });
});
