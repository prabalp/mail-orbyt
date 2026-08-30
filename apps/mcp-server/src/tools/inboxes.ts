import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

const inboxShape = z
  .object({
    id: z.string(),
    emailAddress: z.string(),
    displayName: z.string().nullable(),
    status: z.string(),
    dailySendLimit: z.number(),
    createdAt: z.string(),
  })
  .partial()
  .passthrough();

const dnsCheckShape = z
  .object({
    id: z.string(),
    domain: z.string(),
    spfStatus: z.string(),
    dkimStatus: z.string(),
    dkimSelector: z.string().nullable(),
    dmarcStatus: z.string(),
    checkedAt: z.string(),
  })
  .partial()
  .passthrough();

export const INBOX_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_inboxes",
    title: "List inboxes",
    description: "List connected Gmail sending inboxes and their DNS check status.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/inboxes",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      inboxes: z.array(inboxShape).optional(),
      dnsChecks: z.array(dnsCheckShape).optional(),
    },
  },
  {
    name: "update_inbox_send_limit",
    title: "Update an inbox's daily send limit",
    description: "Update an inbox's daily send limit.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/inboxes/{inboxId}",
    requiredScope: "inboxes:manage",
    inputShape: {
      inboxId: z.string().min(1),
      dailySendLimit: z.number().int().min(1).max(500),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: inboxShape.shape,
  },
  {
    name: "disconnect_inbox",
    title: "Disconnect an inbox",
    description: "Disconnect a sending inbox.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/inboxes/{inboxId}",
    requiredScope: "inboxes:manage",
    inputShape: { inboxId: z.string().min(1) },
    // Destructive: Google's refresh token is revoked, so reconnecting means
    // a human re-running the OAuth consent flow.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: { ...inboxShape.shape, disconnectedAt: z.string().nullable().optional() },
  },
];
