import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

const leadListShape = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    /** Only present on the list endpoint, which joins in membership counts. */
    leadCount: z.number(),
  })
  .partial()
  .passthrough();

export const LEAD_LIST_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_lead_lists",
    title: "List lead lists",
    description: "List lead lists for the organisation.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/lead-lists",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: { leadLists: z.array(leadListShape).optional() },
  },
  {
    name: "create_lead_list",
    title: "Create lead list",
    description:
      "Create a new lead list, either from an explicit set of lead IDs or from a filter.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/lead-lists",
    requiredScope: "leads:manage",
    inputShape: {
      name: z.string().min(1).max(120),
      description: z.string().max(500).optional(),
      leadIds: z.array(z.string().min(1)).max(50000).optional(),
      filter: z
        .object({
          search: z.string().optional(),
          status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
          leadListId: z.string().min(1).optional(),
        })
        .optional()
        .describe("Populate from leads matching this filter instead of an explicit leadIds list"),
    },
    // Idempotent by name: a repeat call reuses the existing list rather than
    // creating a second one, and membership inserts skip duplicates.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: {
      leadList: leadListShape.optional(),
      added: z.number().optional().describe("How many leads this call newly added to the list"),
    },
  },
  {
    name: "delete_lead_list",
    title: "Delete lead list",
    description:
      "Delete a lead list. The leads in it are not deleted — only the list and its membership links.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/lead-lists/{leadListId}",
    requiredScope: "leads:manage",
    inputShape: {
      leadListId: z.string().min(1),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];
