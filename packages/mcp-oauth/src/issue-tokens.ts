import type { PrismaClient } from "@mail-orbyt/database";
import { generateSecureToken, hashToken, tokenExpiryDate } from "@mail-orbyt/authentication";
import {
  DEFAULT_ACCESS_TOKEN_TTL_MS,
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  RESOURCE_SCOPED_ACCESS_TOKEN_TTL_MS,
} from "./constants";

export interface TokenPairResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  tokenType: "Bearer";
  resource: string;
}

export interface IssueTokenPairParams {
  clientRowId: string;
  userId: string;
  organisationId: string;
  scope: string;
  /** RFC 8707 resource this token pair is audienced to — see constants.ts. */
  resource: string;
  /** The McpPlatformGrant this pair was issued under — see platform-grants.ts. */
  platformGrantId: string;
  accessTokenTtlMs?: number;
  refreshTokenTtlMs?: number;
}

/** Shared by both the authorization-code exchange and the refresh grant — the only place a full access+refresh token pair is created. */
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
      resource: params.resource,
      platformGrantId: params.platformGrantId,
      expiresAt: tokenExpiryDate(accessTtlMs),
    },
  });

  await prisma.mcpRefreshToken.create({
    data: {
      tokenHash: hashToken(rawRefreshToken),
      clientId: params.clientRowId,
      userId: params.userId,
      organisationId: params.organisationId,
      scope: params.scope,
      resource: params.resource,
      platformGrantId: params.platformGrantId,
      expiresAt: tokenExpiryDate(refreshTtlMs),
    },
  });

  return {
    accessToken: rawAccessToken,
    refreshToken: rawRefreshToken,
    expiresIn: Math.floor(accessTtlMs / 1000),
    scope: params.scope,
    tokenType: "Bearer",
    resource: params.resource,
  };
}

export interface ResourceScopedTokenResult {
  accessToken: string;
  expiresIn: number;
  scope: string;
  tokenType: "Bearer";
  resource: string;
}

export interface IssueResourceScopedAccessTokenParams {
  clientRowId: string;
  userId: string;
  organisationId: string;
  scope: string;
  resource: string;
  platformGrantId: string;
  accessTokenTtlMs?: number;
}

/**
 * The RFC 8693 token-exchange grant's counterpart to issueTokenPair: an
 * access-token-only mint (no refresh token — see the McpRefreshToken model
 * comment) for a specific downstream resource, short-lived by default.
 * ARCHITECTURE.md §4.2/§6.
 */
export async function issueResourceScopedAccessToken(
  prisma: Pick<PrismaClient, "mcpAccessToken">,
  params: IssueResourceScopedAccessTokenParams,
): Promise<ResourceScopedTokenResult> {
  const rawAccessToken = generateSecureToken();
  const ttlMs = params.accessTokenTtlMs ?? RESOURCE_SCOPED_ACCESS_TOKEN_TTL_MS;

  await prisma.mcpAccessToken.create({
    data: {
      tokenHash: hashToken(rawAccessToken),
      clientId: params.clientRowId,
      userId: params.userId,
      organisationId: params.organisationId,
      scope: params.scope,
      resource: params.resource,
      platformGrantId: params.platformGrantId,
      expiresAt: tokenExpiryDate(ttlMs),
    },
  });

  return {
    accessToken: rawAccessToken,
    expiresIn: Math.floor(ttlMs / 1000),
    scope: params.scope,
    tokenType: "Bearer",
    resource: params.resource,
  };
}
