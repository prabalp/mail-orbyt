import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@mail-orbyt/database";

export interface RegisterClientParams {
  clientName: string;
  redirectUris: string[];
}

export interface RegisteredClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
}

function generateClientId(): string {
  return `mcp_${randomBytes(16).toString("hex")}`;
}

/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591). Public clients only —
 * no client secret is issued, since the authorization-code exchange is
 * secured by PKCE instead (see pkce.ts).
 */
export async function registerClient(
  prisma: Pick<PrismaClient, "mcpOAuthClient">,
  params: RegisterClientParams,
): Promise<RegisteredClient> {
  if (params.redirectUris.length === 0) {
    throw new Error("At least one redirect_uri is required");
  }

  const client = await prisma.mcpOAuthClient.create({
    data: {
      clientId: generateClientId(),
      clientName: params.clientName,
      redirectUris: params.redirectUris,
    },
  });

  return {
    clientId: client.clientId,
    clientName: client.clientName,
    redirectUris: client.redirectUris,
  };
}
