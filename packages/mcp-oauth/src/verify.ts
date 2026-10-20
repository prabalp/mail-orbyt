import type { PrismaClient } from "@mail-orbyt/database";
import { hashToken, isTokenExpired } from "@mail-orbyt/authentication";

export interface VerifiedAccessToken {
  userId: string;
  organisationId: string;
  scope: string;
  clientId: string;
  /** RFC 8707 audience this token is valid for — a resource server must additionally check this equals its own resource URI (ARCHITECTURE.md §4.3); this function only checks the token itself is unrevoked/unexpired, not who it's audienced to. */
  resource: string;
}

/**
 * The single function both apps/web (bearer-token path of its REST API) and
 * apps/mcp-server (the /mcp endpoint itself) call to validate a token —
 * kept in one place so token semantics (hashing, expiry, revocation) never
 * drift between the two call sites.
 */
export async function verifyAccessToken(
  prisma: Pick<PrismaClient, "mcpAccessToken">,
  rawToken: string,
): Promise<VerifiedAccessToken | null> {
  if (!rawToken) return null;

  const token = await prisma.mcpAccessToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  if (!token || token.revokedAt || isTokenExpired(token.expiresAt)) return null;

  return {
    userId: token.userId,
    organisationId: token.organisationId,
    scope: token.scope,
    clientId: token.clientId,
    resource: token.resource,
  };
}
