import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

/**
 * Self-management of the AI connections themselves. Both are deliberately
 * `profile`-scoped rather than `members:manage`: the underlying route only
 * ever lists and revokes the CALLING user's own connections, so this is a
 * user managing their own credentials, not an administrator managing
 * someone else's.
 */
export const MCP_CONNECTION_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_mcp_connections",
    title: "List connected AI clients",
    description:
      "List the AI clients you have connected to this organisation, with the permissions each was granted and when it was last used.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/settings/mcp-connections",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      connections: z
        .array(
          z
            .object({
              clientId: z.string(),
              clientName: z.string(),
              scope: z.string(),
              createdAt: z.string(),
              lastUsedAt: z.string().nullable(),
            })
            .partial()
            .passthrough(),
        )
        .optional(),
    },
  },
  {
    name: "revoke_mcp_connection",
    title: "Revoke a connected AI client",
    description:
      "Revoke one of your connected AI clients, immediately invalidating its access and refresh tokens. Note that revoking the client you are currently talking through will end this connection mid-conversation — confirm which client is meant before calling.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/settings/mcp-connections",
    requiredScope: "profile",
    inputShape: {
      clientId: z.string().min(1).describe("From list_mcp_connections"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
];
