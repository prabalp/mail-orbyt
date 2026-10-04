import type { PrismaClient } from "@mail-orbyt/database";
import { generateSecureToken, hashToken, tokenExpiryDate } from "@mail-orbyt/authentication";
import { DEFAULT_ACCESS_TOKEN_TTL_MS, DEFAULT_REFRESH_TOKEN_TTL_MS } from "./constants";

export interface TokenPairResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  tokenType: "Bearer";
}

export interface IssueTokenPairParams {
  clientRowId: string;
  userId: string;
  organisationId: string;
  scope: string;
  accessTokenTtlMs?: number;
  refreshTokenTtlMs?: number;
  /** RFC 8707 audience; omitted means the column default (mail-orbyt's mcp-server). */
  resource?: string;
  platformGrantId?: string | null;
}

/** Shared by both the authorization-code exchange and the refresh grant — the only place access/refresh token rows are created. */
export async function issueTokenPair(
  prisma: Pick<PrismaClient, "mcpAccessToken" | "mcpRefreshToken">,
  params: IssueTokenPairParams,
): Promise<TokenPairResult> {
  const rawAccessToken = generateSecureToken();
  const rawRefreshToken = generateSecureToken();
  const accessTtlMs = params.accessTokenTtlMs ?? DEFAULT_ACCESS_TOKEN_TTL_MS;
  const refreshTtlMs = params.refreshTokenTtlMs ?? DEFAULT_REFRESH_TOKEN_TTL_MS;

  await prisma.mcpAccessToken.create({
    data: {
      tokenHash: hashToken(rawAccessToken),
      clientId: params.clientRowId,
      userId: params.userId,
      organisationId: params.organisationId,
      scope: params.scope,
      expiresAt: tokenExpiryDate(accessTtlMs),
      ...(params.resource ? { resource: params.resource } : {}),
      platformGrantId: params.platformGrantId ?? null,
    },
  });

  await prisma.mcpRefreshToken.create({
    data: {
      tokenHash: hashToken(rawRefreshToken),
      clientId: params.clientRowId,
      userId: params.userId,
      organisationId: params.organisationId,
      scope: params.scope,
      expiresAt: tokenExpiryDate(refreshTtlMs),
      ...(params.resource ? { resource: params.resource } : {}),
      platformGrantId: params.platformGrantId ?? null,
    },
  });

  return {
    accessToken: rawAccessToken,
    refreshToken: rawRefreshToken,
    expiresIn: Math.floor(accessTtlMs / 1000),
    scope: params.scope,
    tokenType: "Bearer",
  };
}
