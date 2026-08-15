import type { PrismaClient } from "@mail-orbyt/database";
import { hashToken, isTokenExpired, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { OAuthGrantError } from "./errors";
import { verifyPkce } from "./pkce";
import { intersectScopes, parseScope } from "./scopes";
import { issueTokenPair, type TokenPairResult } from "./issue-tokens";

type ExchangePrisma = Pick<
  PrismaClient,
  | "mcpOAuthClient"
  | "mcpAuthorizationCode"
  | "mcpAccessToken"
  | "mcpRefreshToken"
  | "organisationMembership"
  | "$transaction"
>;

async function resolveClientOrThrow(prisma: Pick<PrismaClient, "mcpOAuthClient">, clientId: string) {
  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId } });
  if (!client) throw new OAuthGrantError("invalid_client", "Unknown client");
  return client;
}

/** Re-derives the user's CURRENT role rather than trusting scope as it stood at consent time — a demotion/removal since then must narrow or reject the grant. */
async function currentGrantableScope(
  prisma: Pick<PrismaClient, "organisationMembership">,
  params: { userId: string; organisationId: string; requestedScope: string },
): Promise<string> {
  const membership = await requireOrganisationMembership(prisma, {
    userId: params.userId,
    organisationId: params.organisationId,
  }).catch(() => null);
  if (!membership) {
    throw new OAuthGrantError("invalid_grant", "User is no longer a member of this organisation");
  }
  return intersectScopes(params.requestedScope, membership.role);
}

export interface ExchangeAuthorizationCodeParams {
  clientId: string;
  rawCode: string;
  redirectUri: string;
  codeVerifier: string;
  accessTokenTtlMs?: number;
  refreshTokenTtlMs?: number;
}

export async function exchangeAuthorizationCode(
  prisma: ExchangePrisma,
  params: ExchangeAuthorizationCodeParams,
): Promise<TokenPairResult> {
  const client = await resolveClientOrThrow(prisma, params.clientId);

  const code = await prisma.mcpAuthorizationCode.findUnique({
    where: { codeHash: hashToken(params.rawCode) },
  });
  if (!code || code.clientId !== client.id) {
    throw new OAuthGrantError("invalid_grant", "Unknown or invalid authorization code");
  }
  if (code.consumedAt || isTokenExpired(code.expiresAt)) {
    throw new OAuthGrantError("invalid_grant", "Authorization code already used or expired");
  }
  if (code.redirectUri !== params.redirectUri) {
    throw new OAuthGrantError("invalid_grant", "redirect_uri does not match the original request");
  }
  if (!verifyPkce(params.codeVerifier, code.codeChallenge, code.codeChallengeMethod)) {
    throw new OAuthGrantError("invalid_grant", "PKCE verification failed");
  }

  const scope = await currentGrantableScope(prisma, {
    userId: code.userId,
    organisationId: code.organisationId,
    requestedScope: code.scope,
  });

  return prisma.$transaction(async (tx) => {
    await tx.mcpAuthorizationCode.update({ where: { id: code.id }, data: { consumedAt: new Date() } });
    return issueTokenPair(tx, {
      clientRowId: client.id,
      userId: code.userId,
      organisationId: code.organisationId,
      scope,
      accessTokenTtlMs: params.accessTokenTtlMs,
      refreshTokenTtlMs: params.refreshTokenTtlMs,
    });
  });
}

export interface RefreshAccessTokenParams {
  clientId: string;
  rawRefreshToken: string;
  accessTokenTtlMs?: number;
  refreshTokenTtlMs?: number;
}

export async function refreshAccessToken(
  prisma: ExchangePrisma,
  params: RefreshAccessTokenParams,
): Promise<TokenPairResult> {
  const client = await resolveClientOrThrow(prisma, params.clientId);

  const tokenHash = hashToken(params.rawRefreshToken);
  const refreshToken = await prisma.mcpRefreshToken.findUnique({ where: { tokenHash } });
  if (!refreshToken || refreshToken.clientId !== client.id) {
    throw new OAuthGrantError("invalid_grant", "Unknown refresh token");
  }
  if (refreshToken.revokedAt || isTokenExpired(refreshToken.expiresAt)) {
    throw new OAuthGrantError("invalid_grant", "Refresh token expired or revoked");
  }

  const scope = await currentGrantableScope(prisma, {
    userId: refreshToken.userId,
    organisationId: refreshToken.organisationId,
    requestedScope: refreshToken.scope,
  });

  return prisma.$transaction(async (tx) => {
    const rotated = await issueTokenPair(tx, {
      clientRowId: client.id,
      userId: refreshToken.userId,
      organisationId: refreshToken.organisationId,
      scope,
      accessTokenTtlMs: params.accessTokenTtlMs,
      refreshTokenTtlMs: params.refreshTokenTtlMs,
    });
    // Rotated, not deleted: reuse of this now-superseded token is detectable via replacedByTokenHash.
    await tx.mcpRefreshToken.update({
      where: { id: refreshToken.id },
      data: { revokedAt: new Date(), replacedByTokenHash: hashToken(rotated.refreshToken) },
    });
    return rotated;
  });
}

// Re-exported so callers validating a requested scope string don't need a separate import.
export { parseScope };
