import type { PrismaClient } from "@mail-orbyt/database";
import { hashToken } from "@mail-orbyt/authentication";
import { revokePlatformGrants } from "./platform-grants";

export async function revokeToken(
  prisma: Pick<PrismaClient, "mcpAccessToken" | "mcpRefreshToken">,
  rawToken: string,
): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  await prisma.mcpAccessToken.updateMany({ where: { tokenHash }, data: { revokedAt: now } });
  await prisma.mcpRefreshToken.updateMany({ where: { tokenHash }, data: { revokedAt: now } });
}

export interface McpConnectionSummary {
  clientId: string;
  clientName: string;
  organisationId: string;
  scope: string;
  createdAt: Date;
}

/** One row per (client, organisation) pair the user has an active grant for — used by the settings/mcp page. */
export async function listActiveConnections(
  prisma: Pick<PrismaClient, "mcpRefreshToken">,
  params: { userId: string },
): Promise<McpConnectionSummary[]> {
  const activeRefreshTokens = await prisma.mcpRefreshToken.findMany({
    where: { userId: params.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { client: true },
    orderBy: { createdAt: "desc" },
  });

  const byConnection = new Map<string, McpConnectionSummary>();
  for (const token of activeRefreshTokens) {
    const key = `${token.clientId}:${token.organisationId}`;
    if (!byConnection.has(key)) {
      byConnection.set(key, {
        clientId: token.client.clientId,
        clientName: token.client.clientName,
        organisationId: token.organisationId,
        scope: token.scope,
        createdAt: token.createdAt,
      });
    }
  }
  return [...byConnection.values()];
}

export async function revokeConnection(
  prisma: Pick<
    PrismaClient,
    "mcpAccessToken" | "mcpRefreshToken" | "mcpOAuthClient" | "mcpPlatformGrant"
  >,
  params: { userId: string; clientId: string; organisationId: string },
): Promise<void> {
  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId: params.clientId } });
  if (!client) return;

  // Cascade: revoking the platform grant revokes every resource token exchanged under it.
  await revokePlatformGrants(prisma, {
    userId: params.userId,
    clientRowId: client.id,
    organisationId: params.organisationId,
  });

  const now = new Date();
  const scope = {
    userId: params.userId,
    clientId: client.id,
    organisationId: params.organisationId,
    revokedAt: null,
  };
  await prisma.mcpAccessToken.updateMany({ where: scope, data: { revokedAt: now } });
  await prisma.mcpRefreshToken.updateMany({ where: scope, data: { revokedAt: now } });
}
