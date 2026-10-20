import type { PrismaClient } from "@mail-orbyt/database";
import { hashToken, isTokenExpired } from "@mail-orbyt/authentication";

export type IntrospectionResult =
  | { active: false }
  | {
      active: true;
      sub: string;
      organisation_id: string;
      scope: string;
      aud: string;
      client_id: string;
      exp: number;
      token_type: "Bearer";
    };

/**
 * RFC 7662 token introspection — the resource-server-facing counterpart to
 * verify.ts (used by apps/mcp-server, which validates tokens in-process
 * against this same database instead). lead_orbyt's MCP server calls this
 * over HTTP via /api/oauth/introspect since it has no access to mail-
 * orbyt's database. ARCHITECTURE.md §6/§7.
 */
export async function introspectToken(
  prisma: Pick<PrismaClient, "mcpAccessToken">,
  rawToken: string,
): Promise<IntrospectionResult> {
  if (!rawToken) return { active: false };

  const token = await prisma.mcpAccessToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { client: { select: { clientId: true } } },
  });
  if (!token || token.revokedAt || isTokenExpired(token.expiresAt)) {
    return { active: false };
  }

  return {
    active: true,
    sub: token.userId,
    organisation_id: token.organisationId,
    scope: token.scope,
    aud: token.resource,
    client_id: token.client.clientId,
    exp: Math.floor(token.expiresAt.getTime() / 1000),
    token_type: "Bearer",
  };
}
