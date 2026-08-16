import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

// Note: the web UI's "switch active organisation" action only sets a
// browser cookie and has no meaning for a token-based client (every tool
// call here is already scoped to the one organisation the access token was
// granted for) — it is deliberately not exposed as a tool.
export const ORGANISATION_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_my_organisations",
    title: "List my organisations",
    description: "List every organisation the connected user is a member of, and their role in each.",
    method: "GET",
    pathTemplate: "/api/organisations",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      organisations: z
        .array(
          z
            .object({
              id: z.string(),
              name: z.string(),
              slug: z.string(),
              role: z.string(),
            })
            .partial()
            .passthrough(),
        )
        .optional(),
    },
  },
  {
    name: "create_organisation",
    title: "Create an organisation",
    description: "Create a new organisation, with the connected user as its owner.",
    method: "POST",
    pathTemplate: "/api/organisations",
    requiredScope: "profile",
    inputShape: { name: z.string().min(1).max(120) },
    // Not idempotent: names are not unique, so calling twice creates two.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    outputShape: {
      id: z.string().optional(),
      name: z.string().optional(),
      slug: z.string().optional(),
    },
  },
  {
    name: "get_organisation",
    title: "Get this organisation",
    description: "Get this connection's organisation — id, name, and slug. Use this to read the exact current name before calling delete_organisation, which requires it typed back verbatim.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      id: z.string().optional(),
      name: z.string().optional(),
      slug: z.string().optional(),
    },
  },
  {
    name: "delete_organisation",
    title: "Delete this organisation",
    description: "Permanently delete this connection's organisation and everything scoped to it — every lead, campaign, conversation, connected inbox, and research fact. There is no undo. Requires the OWNER role and the organisation's current exact name (call get_organisation first) as confirmName, matched verbatim server-side — get explicit human confirmation of the name and consequences before calling this.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}",
    requiredScope: "organisation:delete",
    inputShape: {
      confirmName: z.string().min(1).describe("Must exactly equal the organisation's current name, from get_organisation"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
];
