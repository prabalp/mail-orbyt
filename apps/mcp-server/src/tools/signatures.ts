import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

const signatureShape = z
  .object({
    id: z.string(),
    label: z.string(),
    content: z.string(),
    isDefault: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .partial()
  .passthrough();

export const SIGNATURE_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_signatures",
    title: "List signatures",
    description: "List email signatures for the organisation.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/signatures",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: { signatures: z.array(signatureShape).optional() },
  },
  {
    name: "create_signature",
    title: "Create a signature",
    description: "Create a new email signature.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/signatures",
    requiredScope: "inboxes:manage",
    inputShape: {
      label: z.string().min(1).max(100),
      content: z.string().min(1).max(2000),
      isDefault: z.boolean().optional(),
    },
    // Not idempotent: calling twice creates two signatures.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    outputShape: signatureShape.shape,
  },
  {
    name: "update_signature",
    title: "Update a signature",
    description: "Update an email signature.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/signatures/{signatureId}",
    requiredScope: "inboxes:manage",
    inputShape: {
      signatureId: z.string().min(1),
      label: z.string().min(1).max(100).optional(),
      content: z.string().min(1).max(2000).optional(),
      isDefault: z.literal(true).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    outputShape: signatureShape.shape,
  },
  {
    name: "delete_signature",
    title: "Delete a signature",
    description: "Delete an email signature.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/signatures/{signatureId}",
    requiredScope: "inboxes:manage",
    inputShape: { signatureId: z.string().min(1) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    outputShape: signatureShape.shape,
  },
];
