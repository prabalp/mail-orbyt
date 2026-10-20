import type { PrismaClient } from "@mail-orbyt/database";
import {
  hashToken,
  isTokenExpired,
  recordAuditEvent,
  requireOrganisationMembership,
} from "@mail-orbyt/authentication";
import { MAIL_ORBYT_MCP_RESOURCE_URI } from "./constants";
import { OAuthGrantError } from "./errors";
import { verifyPkce } from "./pkce";
import { intersectScopes, parseScope } from "./scopes";
import {
  issueResourceScopedAccessToken,
  issueTokenPair,
  type ResourceScopedTokenResult,
  type TokenPairResult,
} from "./issue-tokens";
import { ensurePlatformGrantId } from "./platform-grants";
import { findKnownResource } from "./resources";

type ExchangePrisma = Pick<
  PrismaClient,
  | "mcpOAuthClient"
  | "mcpAuthorizationCode"
  | "mcpAccessToken"
  | "mcpRefreshToken"
  | "mcpPlatformGrant"
  | "organisationMembership"
  | "auditEvent"
  | "$transaction"
>;

async function resolveClientOrThrow(
  prisma: Pick<PrismaClient, "mcpOAuthClient">,
  clientId: string,
) {
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
  const resource = code.resource ?? MAIL_ORBYT_MCP_RESOURCE_URI;

  return prisma.$transaction(async (tx) => {
    await tx.mcpAuthorizationCode.update({
      where: { id: code.id },
      data: { consumedAt: new Date() },
    });
    // Normally already created by completeAuthorization() at consent-approval
    // time; ensurePlatformGrantId's create-or-reuse behavior is a defensive
    // fallback, not the common path.
    const platformGrantId = await ensurePlatformGrantId(tx, {
      userId: code.userId,
      organisationId: code.organisationId,
      clientRowId: client.id,
      scope,
    });
    return issueTokenPair(tx, {
      clientRowId: client.id,
      userId: code.userId,
      organisationId: code.organisationId,
      scope,
      resource,
      platformGrantId,
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
  const resource = refreshToken.resource ?? MAIL_ORBYT_MCP_RESOURCE_URI;

  const rotated = await prisma.$transaction(async (tx) => {
    // refreshToken.platformGrantId is null only for a token minted before
    // this migration — ensurePlatformGrantId backfills a grant for it from
    // its own (still-valid) scope rather than breaking an active session.
    const platformGrantId =
      refreshToken.platformGrantId ??
      (await ensurePlatformGrantId(tx, {
        userId: refreshToken.userId,
        organisationId: refreshToken.organisationId,
        clientRowId: client.id,
        scope,
      }));

    const issued = await issueTokenPair(tx, {
      clientRowId: client.id,
      userId: refreshToken.userId,
      organisationId: refreshToken.organisationId,
      scope,
      resource,
      platformGrantId,
      accessTokenTtlMs: params.accessTokenTtlMs,
      refreshTokenTtlMs: params.refreshTokenTtlMs,
    });
    // Rotated, not deleted: reuse of this now-superseded token is detectable via replacedByTokenHash.
    await tx.mcpRefreshToken.update({
      where: { id: refreshToken.id },
      data: { revokedAt: new Date(), replacedByTokenHash: hashToken(issued.refreshToken) },
    });
    return issued;
  });

  await recordAuditEvent(prisma, {
    type: "MCP_TOKEN_REFRESHED",
    userId: refreshToken.userId,
    organisationId: refreshToken.organisationId,
    metadata: { clientId: client.clientId },
  });
  return rotated;
}

export interface ExchangeTokenForResourceParams {
  /** The client presenting the subject token — must be the same client the subject token was issued to; these are public/PKCE clients with no secret, so client_id match is the available check, same as refreshAccessToken. */
  clientId: string;
  /** The platform (or another already-issued) access token being exchanged. */
  subjectToken: string;
  /** RFC 8707 resource being requested — must be a registered McpResource. */
  resource: string;
  accessTokenTtlMs?: number;
}

/**
 * RFC 8693 token-exchange grant (ARCHITECTURE.md §4.2/§6): silently mints a
 * short-TTL, resource-audienced access token for a specific downstream
 * backend from an already-issued (typically Gateway-audienced) access
 * token, with no further user interaction. Never issues a refresh token —
 * see the McpRefreshToken model comment.
 */
export async function exchangeTokenForResource(
  prisma: ExchangePrisma & { mcpResource: PrismaClient["mcpResource"] },
  params: ExchangeTokenForResourceParams,
): Promise<ResourceScopedTokenResult> {
  const client = await resolveClientOrThrow(prisma, params.clientId);

  const subjectToken = await prisma.mcpAccessToken.findUnique({
    where: { tokenHash: hashToken(params.subjectToken) },
  });
  if (!subjectToken || subjectToken.clientId !== client.id) {
    throw new OAuthGrantError("invalid_grant", "Unknown subject_token");
  }
  if (subjectToken.revokedAt || isTokenExpired(subjectToken.expiresAt)) {
    throw new OAuthGrantError("invalid_grant", "subject_token expired or revoked");
  }

  const targetResource = await findKnownResource(prisma, params.resource);
  if (!targetResource) {
    throw new OAuthGrantError("invalid_target", "Unknown or unregistered resource");
  }

  // Never exceeds what the subject token itself was scoped to, and is
  // re-derived against the user's CURRENT role — same pattern as refresh.
  const currentScope = await currentGrantableScope(prisma, {
    userId: subjectToken.userId,
    organisationId: subjectToken.organisationId,
    requestedScope: subjectToken.scope,
  });
  const subjectScopes = new Set(parseScope(subjectToken.scope));
  const scope = parseScope(currentScope)
    .filter((s) => subjectScopes.has(s))
    .join(" ");

  const platformGrantId =
    subjectToken.platformGrantId ??
    (await ensurePlatformGrantId(prisma, {
      userId: subjectToken.userId,
      organisationId: subjectToken.organisationId,
      clientRowId: client.id,
      scope,
    }));

  return issueResourceScopedAccessToken(prisma, {
    clientRowId: client.id,
    userId: subjectToken.userId,
    organisationId: subjectToken.organisationId,
    scope,
    resource: targetResource.resourceUri,
    platformGrantId,
    accessTokenTtlMs: params.accessTokenTtlMs,
  });
}

// Re-exported so callers validating a requested scope string don't need a separate import.
export { parseScope };
