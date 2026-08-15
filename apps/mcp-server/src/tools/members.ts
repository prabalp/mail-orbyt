import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

export const MEMBER_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_members",
    title: "List members",
    description:
      "List everyone in the organisation with their role and join date. Call this first when asked to change or remove someone — update_member_role and remove_member both need a userId, and this is the only way to find one.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/members",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      members: z
        .array(
          z
            .object({
              userId: z.string(),
              email: z.string(),
              name: z.string().nullable(),
              role: z.string(),
              joinedAt: z.string(),
            })
            .partial()
            .passthrough(),
        )
        .optional(),
    },
  },
  {
    name: "update_member_role",
    title: "Change a member's role",
    description:
      "Change a member's role within the organisation. You cannot assign a role above your own, and an organisation must always keep at least one owner.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/members/{userId}",
    requiredScope: "members:manage",
    inputShape: {
      userId: z.string().min(1).describe("From list_members — the user's id, not their email"),
      role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "remove_member",
    title: "Remove a member",
    description:
      "Remove a member from the organisation, revoking their access immediately. Confirm with a human first — re-adding them requires a fresh invitation.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/members/{userId}",
    requiredScope: "members:manage",
    inputShape: { userId: z.string().min(1).describe("From list_members") },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
];
