import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { hashToken } from "@mail-orbyt/authentication";
import { exchangeAuthorizationCode, refreshAccessToken } from "./exchange";
import { OAuthGrantError } from "./errors";

const CLIENT_ROW = {
  id: "client-row-1",
  clientId: "mcp_abc123",
  clientName: "Claude",
  redirectUris: ["https://claude.ai/callback"],
};
const CODE_VERIFIER = "test-code-verifier";
const CODE_CHALLENGE = createHash("sha256").update(CODE_VERIFIER).digest("base64url");

function fakePrisma(overrides: Record<string, unknown> = {}) {
  const tx = {
    mcpOAuthClient: { findUnique: vi.fn().mockResolvedValue(CLIENT_ROW) },
    mcpAuthorizationCode: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
    mcpAccessToken: { create: vi.fn().mockResolvedValue(undefined) },
    mcpRefreshToken: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    organisationMembership: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ organisationId: "org-1", userId: "user-1", role: "ADMIN" }),
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

describe("exchangeAuthorizationCode", () => {
  it("issues a token pair for a valid code + PKCE verifier", async () => {
    const rawCode = "raw-code-value";
    const prisma = fakePrisma({
      mcpAuthorizationCode: {
        findUnique: vi.fn().mockResolvedValue({
          id: "code-1",
          codeHash: hashToken(rawCode),
          clientId: CLIENT_ROW.id,
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile leads:manage organisation:delete",
          redirectUri: "https://claude.ai/callback",
          codeChallenge: CODE_CHALLENGE,
          codeChallengeMethod: "S256",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await exchangeAuthorizationCode(prisma, {
      clientId: CLIENT_ROW.clientId,
      rawCode,
      redirectUri: "https://claude.ai/callback",
      codeVerifier: CODE_VERIFIER,
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    // organisation:delete is not an ADMIN permission — the granted scope narrows to what the role actually holds.
    expect(result.scope).toBe("profile leads:manage");
    expect(prisma.mcpAuthorizationCode.update).toHaveBeenCalledWith({
      where: { id: "code-1" },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("rejects a code that has already been consumed", async () => {
    const rawCode = "raw-code-value";
    const prisma = fakePrisma({
      mcpAuthorizationCode: {
        findUnique: vi.fn().mockResolvedValue({
          id: "code-1",
          codeHash: hashToken(rawCode),
          clientId: CLIENT_ROW.id,
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          redirectUri: "https://claude.ai/callback",
          codeChallenge: CODE_CHALLENGE,
          codeChallengeMethod: "S256",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: new Date(),
        }),
      },
    });

    await expect(
      exchangeAuthorizationCode(prisma, {
        clientId: CLIENT_ROW.clientId,
        rawCode,
        redirectUri: "https://claude.ai/callback",
        codeVerifier: CODE_VERIFIER,
      }),
    ).rejects.toThrow(OAuthGrantError);
  });

  it("rejects a mismatched PKCE verifier", async () => {
    const rawCode = "raw-code-value";
    const prisma = fakePrisma({
      mcpAuthorizationCode: {
        findUnique: vi.fn().mockResolvedValue({
          id: "code-1",
          codeHash: hashToken(rawCode),
          clientId: CLIENT_ROW.id,
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          redirectUri: "https://claude.ai/callback",
          codeChallenge: CODE_CHALLENGE,
          codeChallengeMethod: "S256",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        }),
      },
    });

    await expect(
      exchangeAuthorizationCode(prisma, {
        clientId: CLIENT_ROW.clientId,
        rawCode,
        redirectUri: "https://claude.ai/callback",
        codeVerifier: "wrong-verifier",
      }),
    ).rejects.toThrow(OAuthGrantError);
  });

  it("rejects when the user is no longer a member of the organisation", async () => {
    const rawCode = "raw-code-value";
    const prisma = fakePrisma({
      mcpAuthorizationCode: {
        findUnique: vi.fn().mockResolvedValue({
          id: "code-1",
          codeHash: hashToken(rawCode),
          clientId: CLIENT_ROW.id,
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          redirectUri: "https://claude.ai/callback",
          codeChallenge: CODE_CHALLENGE,
          codeChallengeMethod: "S256",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        }),
      },
      organisationMembership: { findUnique: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      exchangeAuthorizationCode(prisma, {
        clientId: CLIENT_ROW.clientId,
        rawCode,
        redirectUri: "https://claude.ai/callback",
        codeVerifier: CODE_VERIFIER,
      }),
    ).rejects.toThrow(OAuthGrantError);
  });
});

describe("refreshAccessToken", () => {
  it("rotates the refresh token and issues a fresh access token", async () => {
    const rawRefreshToken = "raw-refresh-token";
    const prisma = fakePrisma({
      mcpRefreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "refresh-1",
          tokenHash: hashToken(rawRefreshToken),
          clientId: CLIENT_ROW.id,
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile leads:manage",
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        }),
        create: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await refreshAccessToken(prisma, {
      clientId: CLIENT_ROW.clientId,
      rawRefreshToken,
    });

    expect(result.accessToken).toBeTruthy();
    expect(prisma.mcpRefreshToken.update).toHaveBeenCalledWith({
      where: { id: "refresh-1" },
      data: { revokedAt: expect.any(Date), replacedByTokenHash: hashToken(result.refreshToken) },
    });
  });

  it("rejects a revoked refresh token", async () => {
    const rawRefreshToken = "raw-refresh-token";
    const prisma = fakePrisma({
      mcpRefreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: "refresh-1",
          tokenHash: hashToken(rawRefreshToken),
          clientId: CLIENT_ROW.id,
          userId: "user-1",
          organisationId: "org-1",
          scope: "profile",
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date(),
        }),
      },
    });

    await expect(
      refreshAccessToken(prisma, { clientId: CLIENT_ROW.clientId, rawRefreshToken }),
    ).rejects.toThrow(OAuthGrantError);
  });
});
