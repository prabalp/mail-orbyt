import type { PrismaClient } from "@mail-orbyt/database";
import { generateSecureToken, hashToken, tokenExpiryDate } from "@mail-orbyt/authentication";
import { AUTHORIZATION_CODE_TTL_MS } from "./constants";

export interface CreateAuthorizationCodeParams {
  /** The McpOAuthClient row's internal id (not the public client_id) — resolve the client first. */
  clientRowId: string;
  userId: string;
  organisationId: string;
  scope: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  /** RFC 8707 audience the resulting token is bound to; omitted means the column default (mail-orbyt's mcp-server). */
  resource?: string;
  platformGrantId?: string;
}

/**
 * Issued once the user approves the consent screen. Single-use (see
 * `consumedAt` in exchangeAuthorizationCode) and short-lived — it exists
 * only for the moment between the authorize redirect and the client's
 * immediate token-endpoint call.
 */
export async function createAuthorizationCode(
  prisma: Pick<PrismaClient, "mcpAuthorizationCode">,
  params: CreateAuthorizationCodeParams,
): Promise<{ rawCode: string }> {
  const rawCode = generateSecureToken();

  await prisma.mcpAuthorizationCode.create({
    data: {
      codeHash: hashToken(rawCode),
      clientId: params.clientRowId,
      userId: params.userId,
      organisationId: params.organisationId,
      scope: params.scope,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      ...(params.resource ? { resource: params.resource } : {}),
      platformGrantId: params.platformGrantId ?? null,
      expiresAt: tokenExpiryDate(AUTHORIZATION_CODE_TTL_MS),
    },
  });

  return { rawCode };
}
