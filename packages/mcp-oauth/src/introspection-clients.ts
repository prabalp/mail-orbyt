import type { PrismaClient } from "@mail-orbyt/database";
import { generateSecureToken, hashToken } from "@mail-orbyt/authentication";

function generateIntrospectionClientId(): string {
  return `mcpintro_${generateSecureToken().slice(0, 24)}`;
}

export interface CreateIntrospectionClientResult {
  clientId: string;
  /** Shown exactly once — only its hash is ever persisted. Whoever runs the provisioning script is responsible for handing this to the backend operator (e.g. lead_orbyt) out of band. */
  clientSecret: string;
}

/**
 * Confidential clients minted this way are never exposed through the
 * public /api/oauth/register endpoint (RFC 7591 registration stays
 * public/PKCE-only, per client-registration.ts) — this is for the small,
 * fixed set of server-to-server callers that authenticate as themselves to
 * call RFC 7662 introspection, provisioned out of band by an operator (see
 * scripts/create-introspection-client.ts). ARCHITECTURE.md §6/§7.
 */
export async function createIntrospectionClient(
  prisma: Pick<PrismaClient, "mcpOAuthClient">,
  params: { clientName: string },
): Promise<CreateIntrospectionClientResult> {
  const clientId = generateIntrospectionClientId();
  const clientSecret = generateSecureToken();

  await prisma.mcpOAuthClient.create({
    data: {
      clientId,
      clientName: params.clientName,
      redirectUris: [], // never used in a browser redirect flow
      clientSecretHash: hashToken(clientSecret),
    },
  });

  return { clientId, clientSecret };
}

/**
 * HTTP Basic auth check for the introspection endpoint (RFC 7662 requires
 * the caller to authenticate as a registered client). Returns the resolved
 * McpOAuthClient row id on success, or null — a public/PKCE client (no
 * clientSecretHash) can never pass this, by construction.
 */
export async function verifyIntrospectionClient(
  prisma: Pick<PrismaClient, "mcpOAuthClient">,
  params: { clientId: string; clientSecret: string },
): Promise<{ clientRowId: string } | null> {
  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId: params.clientId } });
  if (!client?.clientSecretHash) return null;
  if (client.clientSecretHash !== hashToken(params.clientSecret)) return null;
  return { clientRowId: client.id };
}
