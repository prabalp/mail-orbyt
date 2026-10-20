/**
 * Generalizes packages/gmail/src/inbox-service.ts's connect/disconnect/list
 * pattern for `prisma.socialConnection`, keyed by
 * organisationId+platform+externalAccountId (the schema's compound unique
 * constraint) instead of organisationId+emailAddress.
 */
import type { PrismaClient, SocialPlatform } from "@mail-orbyt/database";
import { decryptSocialToken, encryptSocialToken } from "./token-crypto";
import type { SocialPlatformAdapter } from "./types";

type Prisma = Pick<PrismaClient, "socialConnection">;

export interface ConnectSocialAccountParams {
  organisationId: string;
  platform: SocialPlatform;
  connectedByUserId: string;
  externalAccountId: string;
  externalHandle: string;
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  scopes: string[];
}

/** Connects (or reconnects) a social account. Reconnecting the same platform account within an org replaces its stored tokens rather than creating a duplicate row. */
export async function connectSocialAccount(prisma: Prisma, params: ConnectSocialAccountParams) {
  const tokenExpiresAt =
    params.expiresInSeconds !== undefined
      ? new Date(Date.now() + params.expiresInSeconds * 1000)
      : null;

  const encryptedAccessToken = encryptSocialToken(params.accessToken);
  const encryptedRefreshToken = params.refreshToken
    ? encryptSocialToken(params.refreshToken)
    : null;

  return prisma.socialConnection.upsert({
    where: {
      organisationId_platform_externalAccountId: {
        organisationId: params.organisationId,
        platform: params.platform,
        externalAccountId: params.externalAccountId,
      },
    },
    create: {
      organisationId: params.organisationId,
      platform: params.platform,
      externalAccountId: params.externalAccountId,
      externalHandle: params.externalHandle,
      connectedByUserId: params.connectedByUserId,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt,
      scopes: params.scopes,
      status: "CONNECTED",
      lastSyncedAt: new Date(),
    },
    update: {
      externalHandle: params.externalHandle,
      connectedByUserId: params.connectedByUserId,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt,
      scopes: params.scopes,
      status: "CONNECTED",
      disconnectedAt: null,
      lastSyncedAt: new Date(),
    },
  });
}

export async function listSocialConnections(prisma: Prisma, organisationId: string) {
  return prisma.socialConnection.findMany({
    where: { organisationId, status: { not: "DISCONNECTED" } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Marks a connection DISCONNECTED. This does not call any platform's revoke
 * endpoint — the SocialPlatformAdapter interface has no shared revoke
 * method, since not every platform exposes one the same way. A caller that
 * wants best-effort revocation should decrypt the connection's token first
 * and call the relevant platform's oauth module directly (mirroring
 * packages/gmail/src/inbox-service.ts's disconnectInbox) before/after
 * calling this function.
 */
export async function disconnectSocialAccount(
  prisma: Prisma,
  organisationId: string,
  connectionId: string,
) {
  const connection = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.organisationId !== organisationId) return null;

  return prisma.socialConnection.update({
    where: { id: connectionId },
    data: { status: "DISCONNECTED", disconnectedAt: new Date() },
  });
}

/**
 * Returns a live, usable access token for a connection — refreshing it
 * first if it's expired (or about to, within a 60s margin) and persisting
 * the new one. Connections with a null `tokenExpiresAt` (non-expiring
 * tokens) are returned as-is without attempting a refresh.
 */
export async function getValidAccessToken(
  prisma: PrismaClient,
  adapter: SocialPlatformAdapter,
  connectionId: string,
): Promise<string> {
  const connection = await prisma.socialConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });

  if (connection.tokenExpiresAt === null) {
    return decryptSocialToken(connection.encryptedAccessToken);
  }

  const marginMs = 60_000;
  if (connection.tokenExpiresAt.getTime() - marginMs > Date.now()) {
    return decryptSocialToken(connection.encryptedAccessToken);
  }

  if (!adapter.refreshAccessToken || !connection.encryptedRefreshToken) {
    return decryptSocialToken(connection.encryptedAccessToken);
  }

  const refreshed = await adapter.refreshAccessToken(
    decryptSocialToken(connection.encryptedRefreshToken),
  );

  await prisma.socialConnection.update({
    where: { id: connectionId },
    data: {
      encryptedAccessToken: encryptSocialToken(refreshed.accessToken),
      encryptedRefreshToken: refreshed.refreshToken
        ? encryptSocialToken(refreshed.refreshToken)
        : connection.encryptedRefreshToken,
      tokenExpiresAt:
        refreshed.expiresInSeconds !== undefined
          ? new Date(Date.now() + refreshed.expiresInSeconds * 1000)
          : null,
    },
  });

  return refreshed.accessToken;
}
