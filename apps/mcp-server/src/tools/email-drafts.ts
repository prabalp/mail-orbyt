import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

export const EMAIL_DRAFT_TOOLS: RouteToolDescriptor[] = [
  {
    name: "approve_email_draft",
    title: "Approve email draft",
    description: "Approve an AI-generated email draft for sending.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/email-drafts/{draftId}",
    requiredScope: "campaigns:manage",
    inputShape: {
      draftId: z.string().min(1),
      action: z.literal("approve"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    // The updated draft is returned flat, not wrapped.
    outputShape: {
      id: z.string().optional(),
      leadId: z.string().optional(),
      generationType: z.string().optional(),
      basedOnDraftId: z.string().nullable().optional(),
      subject: z.string().optional(),
      body: z.string().optional(),
      modelUsed: z.string().optional(),
      status: z.string().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
    },
  },
  {
    name: "delete_email_draft",
    title: "Delete email draft",
    description: "Delete an email draft.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/email-drafts/{draftId}",
    requiredScope: "campaigns:manage",
    inputShape: { draftId: z.string().min(1) },
    // No outputShape: the route answers 204 with an empty body.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
];
