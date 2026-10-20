import type { PrismaClient } from "@mail-orbyt/database";

export interface KnownResource {
  resourceUri: string;
  displayName: string;
  backendKind: "NATIVE_LOCAL" | "NATIVE_INTROSPECTED";
}

/**
 * The McpResource registry (ARCHITECTURE.md §5) is an allowlist of
 * token-exchange TARGETS — every downstream Orbyt MCP backend, not the
 * Gateway's own resource identity (a client requests that for itself at
 * /oauth/authorize; it's never looked up here). Only resources registered
 * here may be exchanged into via the token-exchange grant.
 */
export async function findKnownResource(
  prisma: Pick<PrismaClient, "mcpResource">,
  resourceUri: string,
): Promise<KnownResource | null> {
  return prisma.mcpResource.findUnique({
    where: { resourceUri },
    select: { resourceUri: true, displayName: true, backendKind: true },
  });
}

export async function listKnownResources(
  prisma: Pick<PrismaClient, "mcpResource">,
): Promise<KnownResource[]> {
  return prisma.mcpResource.findMany({
    select: { resourceUri: true, displayName: true, backendKind: true },
    orderBy: { createdAt: "asc" },
  });
}
