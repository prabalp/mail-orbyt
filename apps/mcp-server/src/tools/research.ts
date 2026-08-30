import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

const factShape = z
  .object({
    id: z.string(),
    category: z.string(),
    value: z.string(),
    // OBSERVED / USER_CONFIRMED / USER_REJECTED / CONFLICTED — an edit lands
    // on CONFLICTED, not CONFIRMED, so a human still signs it off.
    status: z.string(),
    sourceUrl: z.string(),
    sourceTitle: z.string().nullable(),
    confidence: z.number(),
    extractionMethod: z.string(),
    evidenceExcerpt: z.string().nullable(),
    observedAt: z.string(),
  })
  .partial()
  .passthrough();

export const RESEARCH_TOOLS: RouteToolDescriptor[] = [
  {
    name: "update_research_fact",
    title: "Review a research fact",
    description: "Confirm, reject, or edit an extracted research fact.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/research/facts/{factId}",
    requiredScope: "research:review",
    inputShape: {
      factId: z.string().min(1),
      action: z.enum(["confirm", "reject", "edit"]),
      value: z.string().min(1).max(2000).optional().describe("Required when action is 'edit'"),
    },
    // Each action is a status (and for 'edit', value) write on one fact, so
    // repeating the same call lands on the same row state. Rejecting only
    // marks the fact USER_REJECTED — nothing is deleted.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: { fact: factShape.optional() },
  },
];
