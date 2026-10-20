import type { PrismaClient } from "@mail-orbyt/database";
import {
  LEAD_ORBYT_MCP_RESOURCE_URI,
  MAIL_ORBYT_MCP_RESOURCE_URI,
  RESOURCE_KIND_GATEWAY,
  RESOURCE_KIND_NATIVE_INTROSPECTED,
  RESOURCE_KIND_NATIVE_LOCAL,
} from "./constants";
import { parseScope } from "./scopes";

export interface ResolvedResource {
  resourceUri: string;
  name: string;
  kind: string;
  allowedScopes: string[] | null;
}

/** scopeMapping is operator-authored JSON; read it defensively. `null` means "no narrowing". */
export function allowedScopesFromMapping(mapping: unknown): string[] | null {
  if (!mapping || typeof mapping !== "object") return null;
  const allowed = (mapping as { allowedScopes?: unknown }).allowedScopes;
  if (!Array.isArray(allowed)) return null;
  return allowed.filter((s): s is string => typeof s === "string");
}

/** Narrows a space-separated scope string to a resource's allowedScopes, if it declares any. */
export function applyResourceScopeMapping(scope: string, allowedScopes: string[] | null): string {
  if (!allowedScopes) return scope;
  const allowed = new Set(allowedScopes);
  return parseScope(scope)
    .filter((s) => allowed.has(s))
    .join(" ");
}

export async function findResource(
  prisma: Pick<PrismaClient, "mcpResource">,
  resourceUri: string,
): Promise<ResolvedResource | null> {
  const row = await prisma.mcpResource.findUnique({ where: { resourceUri } });
  if (!row) return null;
  return {
    resourceUri: row.resourceUri,
    name: row.name,
    kind: row.kind,
    allowedScopes: allowedScopesFromMapping(row.scopeMapping),
  };
}

/**
 * Idempotently registers the known Orbyt resources, including the gateway's
 * own resource URI (which comes from env and so can't live in the SQL
 * migration). Run via the `seed-mcp-resources` script after deploying.
 */
export async function ensureMcpResources(
  prisma: Pick<PrismaClient, "mcpResource">,
  params: { gatewayResourceUri?: string },
): Promise<string[]> {
  const rows = [
    {
      resourceUri: MAIL_ORBYT_MCP_RESOURCE_URI,
      name: "Mail Orbyt MCP server",
      kind: RESOURCE_KIND_NATIVE_LOCAL,
    },
    {
      resourceUri: LEAD_ORBYT_MCP_RESOURCE_URI,
      name: "Lead Orbyt MCP server",
      kind: RESOURCE_KIND_NATIVE_INTROSPECTED,
    },
    ...(params.gatewayResourceUri
      ? [
          {
            resourceUri: params.gatewayResourceUri,
            name: "Orbyt MCP gateway",
            kind: RESOURCE_KIND_GATEWAY,
          },
        ]
      : []),
  ];
  for (const row of rows) {
    await prisma.mcpResource.upsert({
      where: { resourceUri: row.resourceUri },
      create: row,
      update: {},
    });
  }
  return rows.map((r) => r.resourceUri);
}

export interface ResolveAuthorizeResourceParams {
  /** The raw RFC 8707 `resource` query parameter, if the client sent one. */
  requested: string | null;
  /** Public URL of apps/mcp-server — legacy connectors send this as `resource`. */
  mcpServerUrl: string;
}

/**
 * Maps the authorize request's optional `resource` onto a registered
 * resource. Absent, or equal to mcp-server's public URL (what a pre-gateway
 * connector sends), means mail-orbyt's own mcp-server — today's behaviour.
 * Anything else must be registered; returns null otherwise (invalid_target).
 */
export async function resolveAuthorizeResource(
  prisma: Pick<PrismaClient, "mcpResource">,
  params: ResolveAuthorizeResourceParams,
): Promise<ResolvedResource | null> {
  const normalise = (u: string): string => u.replace(/\/+$/, "");
  const requested = params.requested;
  const uri =
    !requested || normalise(requested) === normalise(params.mcpServerUrl)
      ? MAIL_ORBYT_MCP_RESOURCE_URI
      : requested;
  return findResource(prisma, uri);
}
