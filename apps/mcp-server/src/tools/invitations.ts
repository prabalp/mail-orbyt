import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

export const INVITATION_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_invitations",
    title: "List pending invitations",
    description: "List pending invitations for the organisation.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/invitations",
    requiredScope: "members:manage",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      invitations: z
        .array(
          z
            .object({
              id: z.string(),
              email: z.string(),
              role: z.string(),
              expiresAt: z.string(),
            })
            .partial()
            .passthrough(),
        )
        .optional(),
    },
  },
  {
    name: "invite_member",
    title: "Invite a member",
    description:
      "Invite a new member to the organisation. Inviting an ADMIN additionally requires the caller to already be an OWNER or ADMIN (enforced server-side).",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/invitations",
    requiredScope: "members:manage",
    inputShape: {
      email: z.string().email(),
      role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
    },
    // Not idempotent: each call mints a fresh invitation and sends another email.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    outputShape: {
      id: z.string().optional(),
      email: z.string().optional(),
    },
  },
];
