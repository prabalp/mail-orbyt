import type { PrismaClient } from "@mail-orbyt/database";
import {
  generateSecureToken,
  hashToken,
  isTokenExpired,
  requireOrganisationMembership,
  tokenExpiryDate,
} from "@mail-orbyt/authentication";
import {
  ACCESS_TOKEN_TYPE,
  EXCHANGED_ACCESS_TOKEN_TTL_MS,
  RESOURCE_KIND_GATEWAY,
} from "./constants";
import { OAuthGrantError } from "./errors";
import { applyResourceScopeMapping, findResource } from "./resources";
import { intersectScopes } from "./scopes";

type TokenExchangePrisma = Pick<
  PrismaClient,
  | "mcpOAuthClient"
  | "mcpAccessToken"
  | "mcpPlatformGrant"
  | "mcpResource"
  | "organisationMembership"
>;

export interface TokenExchangeParams {
  clientId: string;
  subjectToken: string;
  subjectTokenType: string;
  /** RFC 8707 target resource URI. */
  resource: string;
  /** The gateway's own resource URI — the only audience a valid subject token may carry. */
  gatewayResourceUri: string;
  accessTokenTtlMs?: number;
}

export interface TokenExchangeResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  scope: string;
  issuedTokenType: typeof ACCESS_TOKEN_TYPE;
}

/**
 * RFC 8693 token exchange (ARCHITECTURE.md §4.2). The subject token is the
 * client's platform token; the result is a short-lived, resource-audienced
 * access token (no refresh token) that the gateway presents to one backend.
 * Scope is re-derived from the user's CURRENT role, intersected with the
 * platform grant's scope and the resource's scope mapping.
 */
export async function exchangeTokenForResource(
  prisma: TokenExchangePrisma,
  params: TokenExchangeParams,
): Promise<TokenExchangeResult> {
  if (params.subjectTokenType !== ACCESS_TOKEN_TYPE) {
    throw new OAuthGrantError("invalid_request", "Unsupported subject_token_type");
  }
  if (!params.gatewayResourceUri) {
    // Not configured: fail closed rather than accept tokens with an unknown audience.
    throw new OAuthGrantError("invalid_grant", "Token exchange is not configured");
  }

  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId: params.clientId } });
  if (!client) throw new OAuthGrantError("invalid_client", "Unknown client");

  const subject = await prisma.mcpAccessToken.findUnique({
    where: { tokenHash: hashToken(params.subjectToken) },
  });
  if (
    !subject ||
    subject.revokedAt ||
    isTokenExpired(subject.expiresAt) ||
    subject.clientId !== client.id ||
    // Confused-deputy guard: only the gateway-audienced platform token may be exchanged.
    subject.resource !== params.gatewayResourceUri ||
    !subject.platformGrantId
  ) {
    throw new OAuthGrantError("invalid_grant", "Invalid subject_token");
  }

  const grant = await prisma.mcpPlatformGrant.findUnique({
    where: { id: subject.platformGrantId },
  });
  if (
    !grant ||
    grant.revokedAt ||
    grant.userId !== subject.userId ||
    grant.clientId !== client.id
  ) {
    throw new OAuthGrantError("invalid_grant", "The platform grant is no longer active");
  }

  const target = await findResource(prisma, params.resource);
  // The gateway is an audience for platform tokens only — never an exchange target.
  if (!target || target.kind === RESOURCE_KIND_GATEWAY) {
    throw new OAuthGrantError("invalid_target", "Unknown or unsupported resource");
  }

  const membership = await requireOrganisationMembership(prisma, {
    userId: grant.userId,
    organisationId: subject.organisationId,
  }).catch(() => null);
  if (!membership) {
    throw new OAuthGrantError("invalid_grant", "User is no longer a member of this organisation");
  }

  const scope = applyResourceScopeMapping(
    intersectScopes(grant.scope, membership.role),
    target.allowedScopes,
  );

  const ttlMs = params.accessTokenTtlMs ?? EXCHANGED_ACCESS_TOKEN_TTL_MS;
  const rawAccessToken = generateSecureToken();
  await prisma.mcpAccessToken.create({
    data: {
      tokenHash: hashToken(rawAccessToken),
      clientId: client.id,
      userId: grant.userId,
      organisationId: subject.organisationId,
      scope,
      resource: target.resourceUri,
      platformGrantId: grant.id,
      expiresAt: tokenExpiryDate(ttlMs),
    },
  });

  return {
    accessToken: rawAccessToken,
    tokenType: "Bearer",
    expiresIn: Math.floor(ttlMs / 1000),
    scope,
    issuedTokenType: ACCESS_TOKEN_TYPE,
  };
}
