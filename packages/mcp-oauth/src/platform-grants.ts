import { recordAuditEvent } from "@mail-orbyt/authentication";
import type { PrismaClient } from "@mail-orbyt/database";
import { createAuthorizationCode } from "./authorization-code";
import { intersectScopes } from "./scopes";
import { MAIL_ORBYT_MCP_RESOURCE_URI } from "./constants";

export interface ActivePlatformGrant {
  id: string;
  scope: string;
}

/**
 * The single unrevoked consent record for (userId, organisationId,
 * clientRowId), if one exists. Its presence is what /oauth/authorize checks
 * to decide whether to skip the consent screen entirely — see
 * ARCHITECTURE.md §4.1/§6.
 */
export async function findActivePlatformGrant(
  prisma: Pick<PrismaClient, "mcpPlatformGrant">,
  params: { userId: string; organisationId: string; clientRowId: string },
): Promise<ActivePlatformGrant | null> {
  return prisma.mcpPlatformGrant.findFirst({
    where: {
      userId: params.userId,
      organisationId: params.organisationId,
      clientId: params.clientRowId,
      revokedAt: null,
    },
    select: { id: true, scope: true },
  });
}

/**
 * Returns the id of the active grant for (userId, organisationId,
 * clientRowId), creating (or reactivating) one first if none exists yet.
 * Used both by completeAuthorization (the normal consent-approval path)
 * and, as a backward-compatible fallback, by exchange.ts for tokens minted
 * before this migration — those have `platformGrantId: null` and no prior
 * grant row, but a still-valid refresh token IS the pre-existing consent,
 * so refreshing one transparently backfills its grant rather than breaking
 * an otherwise-legitimate active session.
 */
export async function ensurePlatformGrantId(
  prisma: Pick<PrismaClient, "mcpPlatformGrant">,
  params: { userId: string; organisationId: string; clientRowId: string; scope: string },
): Promise<string> {
  const existing = await findActivePlatformGrant(prisma, params);
  if (existing) return existing.id;

  const grant = await prisma.mcpPlatformGrant.upsert({
    where: {
      userId_organisationId_clientId: {
        userId: params.userId,
        organisationId: params.organisationId,
        clientId: params.clientRowId,
      },
    },
    create: {
      userId: params.userId,
      organisationId: params.organisationId,
      clientId: params.clientRowId,
      scope: params.scope,
    },
    update: { scope: params.scope, revokedAt: null },
  });
  return grant.id;
}

export interface CompleteAuthorizationParams {
  clientRowId: string;
  userId: string;
  organisationId: string;
  /** The org role at the moment of approval — scope is re-derived from it, never trusted from the request. */
  role: Parameters<typeof intersectScopes>[1];
  requestedScope: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  /** RFC 8707 resource param from the authorize request; defaults to mail-orbyt's own resource when omitted (pre-Gateway clients). */
  resource?: string;
}

type AuthorizePrisma = Pick<
  PrismaClient,
  "mcpAuthorizationCode" | "mcpPlatformGrant" | "auditEvent"
>;

/**
 * Records/refreshes the platform-level consent grant and mints the
 * authorization code in one place, so both the explicit "Allow" approval
 * (actions.ts) and the silent skip-consent path (page.tsx, when a grant is
 * already active) go through identical logic rather than two hand-rolled
 * copies of it.
 */
export async function completeAuthorization(
  prisma: AuthorizePrisma,
  params: CompleteAuthorizationParams,
): Promise<{ rawCode: string }> {
  const resource = params.resource?.trim() || MAIL_ORBYT_MCP_RESOURCE_URI;
  const scope = intersectScopes(params.requestedScope, params.role);

  await ensurePlatformGrantId(prisma, {
    userId: params.userId,
    organisationId: params.organisationId,
    clientRowId: params.clientRowId,
    scope,
  });

  const issued = await createAuthorizationCode(prisma, {
    clientRowId: params.clientRowId,
    userId: params.userId,
    organisationId: params.organisationId,
    scope,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    resource,
  });

  await recordAuditEvent(prisma, {
    type: "MCP_AUTHORIZED",
    userId: params.userId,
    organisationId: params.organisationId,
    metadata: { clientRowId: params.clientRowId },
  });

  return issued;
}

type RevokePrisma = Pick<PrismaClient, "mcpPlatformGrant" | "mcpAccessToken" | "mcpRefreshToken">;

/**
 * Revokes the grant itself plus every access/refresh token minted under
 * it — the initial platform token AND every resource-scoped token
 * exchanged from it (mail-orbyt's own mcp-server, lead_orbyt, and any
 * future Orbyt MCP). One disconnect covers everything the user connected
 * via this client, matching the "one consent" model in reverse.
 * ARCHITECTURE.md §6.
 */
export async function revokePlatformGrant(
  prisma: RevokePrisma,
  params: { platformGrantId: string },
): Promise<void> {
  const now = new Date();
  await Promise.all([
    prisma.mcpPlatformGrant.updateMany({
      where: { id: params.platformGrantId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.mcpAccessToken.updateMany({
      where: { platformGrantId: params.platformGrantId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.mcpRefreshToken.updateMany({
      where: { platformGrantId: params.platformGrantId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
}
