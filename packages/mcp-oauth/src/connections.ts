import type { PrismaClient } from "@mail-orbyt/database";
import { hashToken, recordAuditEvent } from "@mail-orbyt/authentication";
import { revokePlatformGrant } from "./platform-grants";

export async function revokeToken(
  prisma: Pick<PrismaClient, "mcpAccessToken" | "mcpRefreshToken" | "auditEvent">,
  rawToken: string,
): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const [access, refresh] = await Promise.all([
    prisma.mcpAccessToken.findFirst({
      where: { tokenHash, revokedAt: null },
      select: { userId: true, organisationId: true, clientId: true },
    }),
    prisma.mcpRefreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      select: { userId: true, organisationId: true, clientId: true },
    }),
  ]);
  const now = new Date();
  await prisma.mcpAccessToken.updateMany({ where: { tokenHash }, data: { revokedAt: now } });
  await prisma.mcpRefreshToken.updateMany({ where: { tokenHash }, data: { revokedAt: now } });

  const subject = access ?? refresh;
  if (!subject) return;

  await recordAuditEvent(prisma, {
    type: "MCP_TOKEN_REVOKED",
    userId: subject.userId,
    organisationId: subject.organisationId,
    metadata: { clientRowId: subject.clientId, via: "token" },
  });
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
    "mcpAccessToken" | "mcpRefreshToken" | "mcpOAuthClient" | "mcpPlatformGrant" | "auditEvent"
  >,
  params: { userId: string; clientId: string; organisationId: string },
): Promise<void> {
  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId: params.clientId } });
  if (!client) return;

  const now = new Date();
  const scope = {
    userId: params.userId,
    clientId: client.id,
    organisationId: params.organisationId,
    revokedAt: null,
  };
  // Covers any token whose platformGrantId is null (pre-migration rows, or
  // a defensive gap) directly by (user, client, organisation) ...
  await prisma.mcpAccessToken.updateMany({ where: scope, data: { revokedAt: now } });
  await prisma.mcpRefreshToken.updateMany({ where: scope, data: { revokedAt: now } });

  // ... and, the normal case going forward, also revokes the platform
  // grant itself so a later reconnect doesn't silently skip consent again
  // (ARCHITECTURE.md §6) — without this, "disconnect" in the MCP
  // connections settings UI would only kill the current tokens, not the
  // standing consent they were minted under.
  const grant = await prisma.mcpPlatformGrant.findFirst({
    where: {
      userId: params.userId,
      organisationId: params.organisationId,
      clientId: client.id,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (grant) {
    await revokePlatformGrant(prisma, { platformGrantId: grant.id });
  }

  await recordAuditEvent(prisma, {
    type: "MCP_TOKEN_REVOKED",
    userId: params.userId,
    organisationId: params.organisationId,
    metadata: { clientId: params.clientId, via: "connection" },
  });
}
