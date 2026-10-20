import type { PrismaClient } from "@mail-orbyt/database";
import {
  hashToken,
  isTokenExpired,
  requireOrganisationMembership,
} from "@mail-orbyt/authentication";
import { intersectScopes } from "./scopes";

export type IntrospectionResult =
  | { active: false }
  | {
      active: true;
      sub: string;
      aud: string;
      scope: string;
      exp: number;
      organisation_id: string;
      client_id: string;
    };

/**
 * RFC 7662 introspection of an access token. Runs the same live checks as
 * verifyAccessToken (revocation, expiry) plus: the derived platform grant
 * must still be active, and scope is re-intersected with the user's CURRENT
 * role (a removed member is inactive). Never distinguishes why a token is
 * inactive.
 */
export async function introspectAccessToken(
  prisma: Pick<PrismaClient, "mcpAccessToken" | "mcpPlatformGrant" | "organisationMembership">,
  rawToken: string,
): Promise<IntrospectionResult> {
  const inactive = { active: false } as const;
  if (!rawToken) return inactive;

  const token = await prisma.mcpAccessToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { client: true },
  });
  if (!token || token.revokedAt || isTokenExpired(token.expiresAt)) return inactive;

  if (token.platformGrantId) {
    const grant = await prisma.mcpPlatformGrant.findUnique({
      where: { id: token.platformGrantId },
    });
    if (!grant || grant.revokedAt) return inactive;
  }

  const membership = await requireOrganisationMembership(prisma, {
    userId: token.userId,
    organisationId: token.organisationId,
  }).catch(() => null);
  if (!membership) return inactive;

  return {
    active: true,
    sub: token.userId,
    aud: token.resource,
    scope: intersectScopes(token.scope, membership.role),
    exp: Math.floor(token.expiresAt.getTime() / 1000),
    organisation_id: token.organisationId,
    client_id: token.client.clientId,
  };
}
