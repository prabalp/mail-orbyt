import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

const jobShape = z
  .object({
    id: z.string(),
    subjectType: z.string(),
    status: z.string(),
    leadId: z.string().nullable(),
    companyId: z.string().nullable(),
    requestedByUserId: z.string().nullable(),
    errorMessage: z.string().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    createdAt: z.string(),
    // Eagerly included so a job can be named without a second lookup.
    lead: z
      .object({
        id: z.string(),
        firstName: z.string().nullable(),
        lastName: z.string().nullable(),
        email: z.string().nullable(),
      })
      .partial()
      .passthrough()
      .nullable(),
    company: z.object({ id: z.string(), name: z.string() }).partial().passthrough().nullable(),
  })
  .partial()
  .passthrough();

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
    name: "list_research_jobs",
    title: "List research jobs",
    description: "List the 50 most recent research jobs org-wide, across leads and companies.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/research",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: { jobs: z.array(jobShape).optional() },
  },
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    outputShape: { fact: factShape.optional() },
  },
];
