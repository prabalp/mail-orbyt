import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

const SUPPRESSION_REASONS = [
  "HARD_BOUNCE",
  "UNSUBSCRIBE",
  "MANUAL_DO_NOT_CONTACT",
  "INVALID_EMAIL",
  "CUSTOMER",
  "ACTIVE_OPPORTUNITY",
] as const;

const entryShape = z
  .object({
    id: z.string(),
    type: z.string(),
    value: z.string(),
    reason: z.string(),
    note: z.string().nullable(),
    createdAt: z.string(),
  })
  .partial()
  .passthrough();

/**
 * The do-not-contact list. Suppression is checked on every send, so this is
 * both a compliance surface (honouring unsubscribes) and a deliverability
 * one (keeping hard bounces out of the sending pool).
 */
export const SUPPRESSION_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_suppressions",
    title: "List suppressed addresses",
    description:
      "List the organisation's suppressed email addresses and domains — everyone who will be skipped at send time, and why.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/suppressions",
    requiredScope: "profile",
    inputShape: {
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(100).optional(),
      search: z.string().optional().describe("Match against the suppressed address or domain"),
      type: z.enum(["EMAIL", "DOMAIN"]).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      entries: z.array(entryShape).optional(),
      totalCount: z.number().optional(),
    },
  },
  {
    name: "check_suppression",
    title: "Check if an address is suppressed",
    description:
      "Check whether a specific email address would be skipped at send time, and report which entry blocks it — the address itself, or a blanket block on its whole domain.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/suppressions",
    requiredScope: "profile",
    inputShape: { email: z.string().min(1).describe("The email address to check") },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      suppressed: z.boolean().optional(),
      matchedBy: entryShape.optional(),
    },
  },
  {
    name: "add_suppression",
    title: "Suppress an address or domain",
    description:
      "Add an email address or a whole domain to the do-not-contact list. Takes effect immediately on every campaign. Use reason UNSUBSCRIBE when someone asks to be removed — that is the compliance-relevant one.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/suppressions",
    requiredScope: "leads:manage",
    inputShape: {
      type: z.enum(["EMAIL", "DOMAIN"]).optional().describe("Defaults to EMAIL"),
      value: z.string().min(1).describe("The email address, or the bare domain for type=DOMAIN"),
      reason: z.enum(SUPPRESSION_REASONS),
      note: z.string().max(500).optional().describe("Free-text context for whoever reviews this later"),
    },
    // Idempotent by (type, value): re-adding an existing entry updates its
    // reason rather than creating a duplicate.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "remove_suppression",
    title: "Un-suppress an address or domain",
    description:
      "Remove an address or domain from the do-not-contact list, making it contactable again. Never remove an UNSUBSCRIBE entry without explicit human instruction — mailing someone who opted out is a compliance breach, not a preference.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/suppressions",
    requiredScope: "leads:manage",
    inputShape: {
      type: z.enum(["EMAIL", "DOMAIN"]).optional().describe("Defaults to EMAIL"),
      value: z.string().min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
];
