import type { PrismaClient } from "@mail-orbyt/database";
import { decryptToken, encryptToken } from "./token-crypto";
import { refreshAccessToken, revokeToken, type GoogleOAuthConfig } from "./google-oauth";

type Prisma = Pick<PrismaClient, "inbox">;

export interface ConnectInboxParams {
  organisationId: string;
  connectedByUserId: string;
  emailAddress: string;
  displayName?: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

/** Connects (or reconnects) a Gmail inbox. Reconnecting the same email address within an org replaces its stored tokens rather than creating a duplicate row. */
export async function connectInbox(prisma: Prisma, params: ConnectInboxParams) {
  const tokenExpiresAt = new Date(Date.now() + params.expiresInSeconds * 1000);

  return prisma.inbox.upsert({
    where: {
      organisationId_emailAddress: {
        organisationId: params.organisationId,
        emailAddress: params.emailAddress,
      },
    },
    create: {
      organisationId: params.organisationId,
      emailAddress: params.emailAddress,
      displayName: params.displayName,
      connectedByUserId: params.connectedByUserId,
      encryptedAccessToken: encryptToken(params.accessToken),
      encryptedRefreshToken: encryptToken(params.refreshToken),
      tokenExpiresAt,
      status: "CONNECTED",
      lastSyncedAt: new Date(),
    },
    update: {
      displayName: params.displayName,
      connectedByUserId: params.connectedByUserId,
      encryptedAccessToken: encryptToken(params.accessToken),
      encryptedRefreshToken: encryptToken(params.refreshToken),
      tokenExpiresAt,
      status: "CONNECTED",
      disconnectedAt: null,
      lastSyncedAt: new Date(),
    },
  });
}

export async function listInboxes(prisma: Prisma, organisationId: string) {
  return prisma.inbox.findMany({
    where: { organisationId, status: { not: "DISCONNECTED" } },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateDailySendLimit(
  prisma: Prisma,
  organisationId: string,
  inboxId: string,
  dailySendLimit: number,
) {
  const inbox = await prisma.inbox.findUnique({ where: { id: inboxId } });
  if (!inbox || inbox.organisationId !== organisationId) return null;
  return prisma.inbox.update({ where: { id: inboxId }, data: { dailySendLimit } });
}

export async function disconnectInbox(prisma: Prisma, organisationId: string, inboxId: string) {
  const inbox = await prisma.inbox.findUnique({ where: { id: inboxId } });
  if (!inbox || inbox.organisationId !== organisationId) return null;

  await revokeToken(decryptToken(inbox.encryptedRefreshToken));

  return prisma.inbox.update({
    where: { id: inboxId },
    data: { status: "DISCONNECTED", disconnectedAt: new Date() },
  });
}

/** Returns a live, usable access token for an inbox — refreshing it first if it's expired (or about to, within a 60s margin) and persisting the new one. */
export async function getValidAccessToken(
  prisma: PrismaClient,
  config: Pick<GoogleOAuthConfig, "clientId" | "clientSecret">,
  inboxId: string,
): Promise<string> {
  const inbox = await prisma.inbox.findUniqueOrThrow({ where: { id: inboxId } });

  const marginMs = 60_000;
  if (inbox.tokenExpiresAt.getTime() - marginMs > Date.now()) {
    return decryptToken(inbox.encryptedAccessToken);
  }

  const refreshed = await refreshAccessToken(config, decryptToken(inbox.encryptedRefreshToken));
  await prisma.inbox.update({
    where: { id: inboxId },
    data: {
      encryptedAccessToken: encryptToken(refreshed.accessToken),
      tokenExpiresAt: new Date(Date.now() + refreshed.expiresInSeconds * 1000),
    },
  });
  return refreshed.accessToken;
}

export function extractDomain(emailAddress: string): string {
  const domain = emailAddress.split("@")[1];
  if (!domain) throw new Error(`Not a valid email address: ${emailAddress}`);
  return domain.toLowerCase();
}
