import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

const filterFields = {
  search: z.string().optional().describe("Free-text search across name/email/company"),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  leadListId: z.string().min(1).optional().describe("Restrict to leads in this lead list"),
};

const leadShape = z
  .object({
    id: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
    title: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    industry: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    country: z.string().nullable(),
    status: z.string(),
    companyId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .partial()
  .passthrough();

const companyShape = z
  .object({
    id: z.string(),
    name: z.string(),
    domain: z.string().nullable(),
    industry: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    country: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .partial()
  .passthrough();

const draftShape = z
  .object({
    id: z.string(),
    leadId: z.string(),
    generationType: z.string(),
    basedOnDraftId: z.string().nullable(),
    subject: z.string(),
    body: z.string(),
    modelUsed: z.string(),
    status: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .partial()
  .passthrough();

const researchJobShape = z
  .object({
    id: z.string(),
    subjectType: z.string(),
    status: z.string(),
    errorMessage: z.string().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .partial()
  .passthrough();

const researchFactShape = z
  .object({
    id: z.string(),
    category: z.string(),
    value: z.string(),
    sourceUrl: z.string(),
    sourceTitle: z.string().nullable(),
    confidence: z.number(),
    status: z.string(),
    observedAt: z.string(),
  })
  .partial()
  .passthrough();

const keywordRunShape = z
  .object({
    id: z.string(),
    mode: z.string(),
    status: z.string(),
    errorMessage: z.string().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .partial()
  .passthrough();

const importBatchShape = z
  .object({
    id: z.string(),
    leadListId: z.string().nullable(),
    fileName: z.string(),
    duplicateStrategy: z.string(),
    status: z.string(),
    totalRows: z.number(),
    importedCount: z.number(),
    skippedCount: z.number(),
    errorCount: z.number(),
    errorMessage: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .partial()
  .passthrough();

export const LEAD_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_leads",
    title: "List leads",
    description:
      "List leads for the organisation, with pagination, search, status and lead-list filters.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/leads",
    requiredScope: "profile",
    inputShape: {
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(200).optional(),
      ...filterFields,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      leads: z.array(leadShape).optional(),
      totalCount: z.number().optional(),
    },
  },
  {
    name: "bulk_update_leads",
    title: "Bulk archive, unarchive or delete leads",
    description:
      "Archive, unarchive, or permanently delete a set of leads — either an explicit list of lead IDs or everything matching a filter.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/leads",
    requiredScope: "leads:manage",
    inputShape: {
      action: z.enum(["archive", "unarchive", "delete"]),
      leadIds: z
        .array(z.string().min(1))
        .min(1)
        .max(50000)
        .optional()
        .describe("Explicit lead IDs — omit to use `filter` instead"),
      filter: z
        .object(filterFields)
        .optional()
        .describe(
          "Apply the action to every lead matching this filter — omit to use `leadIds` instead",
        ),
    },
    // Destructive because action can be "delete" — a hard, cascading erase.
    // Archive/unarchive are reversible, but the hint has to describe the
    // worst thing this one tool can do.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: {
      updated: z.number().optional(),
      deleted: z.number().optional(),
    },
  },
  {
    name: "get_lead",
    title: "Get lead",
    description: "Get a single lead and its associated company.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}",
    requiredScope: "profile",
    inputShape: { leadId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      lead: leadShape.optional(),
      company: companyShape.nullable().optional(),
    },
  },
  {
    name: "delete_lead",
    title: "Delete lead",
    description:
      "Permanently erase a lead and all data derived from it (GDPR erasure) — cascades through enrollments, outbox items, conversations, meetings, and research.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}",
    requiredScope: "leads:manage",
    inputShape: { leadId: z.string().min(1) },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "list_lead_email_drafts",
    title: "List a lead's email drafts",
    description:
      "List AI-generated email drafts for a lead, and whether AI generation is configured for this organisation.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}/email-drafts",
    requiredScope: "profile",
    inputShape: { leadId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      drafts: z.array(draftShape).optional(),
      aiConfigured: z.boolean().optional(),
    },
  },
  {
    name: "generate_lead_email_draft",
    title: "Generate email draft",
    description:
      "Generate a new AI email draft for a lead (initial outreach, follow-up, or close-the-loop).",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}/email-drafts",
    requiredScope: "campaigns:manage",
    inputShape: {
      leadId: z.string().min(1),
      generationType: z.enum(["INITIAL", "FOLLOW_UP", "CLOSE_THE_LOOP"]),
      callToAction: z.string().min(1).max(300),
      basedOnDraftId: z
        .string()
        .min(1)
        .optional()
        .describe("Regenerate from this earlier draft rather than starting fresh"),
    },
    // Not idempotent: each call bills a model round-trip and stores another
    // draft row.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    // The created draft is returned flat, not wrapped.
    outputShape: draftShape.shape,
  },
  {
    name: "list_lead_emails",
    title: "List a lead's sent emails",
    description: "List a lead's full sent-email history across every campaign.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}/emails",
    requiredScope: "profile",
    inputShape: { leadId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      emails: z
        .array(
          z
            .object({
              id: z.string(),
              status: z.string(),
              subject: z.string().nullable(),
              body: z.string().nullable(),
              sentAt: z.string().nullable(),
              scheduledFor: z.string(),
              lastError: z.string().nullable(),
              attempts: z.number(),
              campaign: z.object({ id: z.string(), name: z.string() }).partial().passthrough(),
              step: z
                .object({ id: z.string(), orderIndex: z.number(), stepType: z.string() })
                .partial()
                .passthrough(),
              inbox: z
                .object({ id: z.string(), emailAddress: z.string() })
                .partial()
                .passthrough()
                .nullable(),
              providerMessageId: z.string().nullable(),
              providerThreadId: z.string().nullable(),
            })
            .partial()
            .passthrough(),
        )
        .optional(),
    },
  },
  {
    name: "export_lead_data",
    title: "Export all data held about a lead",
    description: "Export every piece of data held about a lead (GDPR right-to-access bundle).",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}/export",
    requiredScope: "leads:manage",
    inputShape: { leadId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    // A JSON bundle, unlike the CSV export_leads tools below.
    outputShape: {
      lead: leadShape.optional(),
      researchFacts: z.array(researchFactShape).optional(),
      emailDrafts: z.array(draftShape).optional(),
      campaignEnrollments: z.array(z.object({}).partial().passthrough()).optional(),
      conversations: z.array(z.object({}).partial().passthrough()).optional(),
      meetings: z.array(z.object({}).partial().passthrough()).optional(),
      exportedAt: z.string().optional(),
    },
  },
  {
    name: "get_lead_research",
    title: "Get lead research state",
    description: "Get the current research job/state for a lead's website research.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}/research",
    requiredScope: "profile",
    inputShape: { leadId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      facts: z.array(researchFactShape).optional(),
      latestJob: researchJobShape.nullable().optional(),
    },
  },
  {
    name: "start_lead_research",
    title: "Start lead research",
    description: "Kick off deterministic website/company research for a lead.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}/research",
    requiredScope: "research:review",
    inputShape: { leadId: z.string().min(1) },
    // Not idempotent: every call enqueues another research job.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: {
      id: z.string().optional(),
      status: z.string().optional(),
    },
  },
  {
    name: "get_lead_research_keywords",
    title: "Get lead keyword-extraction state",
    description: "Get the keyword-extraction state for a lead.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}/research/keywords",
    requiredScope: "profile",
    inputShape: { leadId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      available: z.boolean().optional(),
      latestRun: keywordRunShape.nullable().optional(),
      pageText: z.object({}).partial().passthrough().nullable().optional(),
    },
  },
  {
    name: "start_lead_research_keywords",
    title: "Start lead keyword extraction",
    description: "Start keyword extraction for a lead (requires research to have already run).",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}/research/keywords",
    requiredScope: "research:review",
    inputShape: { leadId: z.string().min(1) },
    // Not idempotent: every call enqueues another extraction run.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: { researchSourceId: z.string().optional() },
  },
  {
    name: "export_leads",
    title: "Export leads as CSV",
    description: "Export leads matching a filter (or all leads) as CSV.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/leads/export",
    requiredScope: "profile",
    inputShape: filterFields,
    // No outputShape: the body is text/csv, not a JSON object.
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "export_selected_leads",
    title: "Export selected leads as CSV",
    description: "Export an explicit set of leads as CSV.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/leads/export",
    requiredScope: "profile",
    inputShape: { leadIds: z.array(z.string().min(1)).min(1).max(50000) },
    // POSTed only because a 50k-ID selection won't fit in a URL — it reads
    // and returns CSV, changing nothing, so it's a read.
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "list_lead_import_batches",
    title: "List CSV import batches",
    description: "List the organisation's 50 most recent CSV lead-import batches.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/leads/import",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: { batches: z.array(importBatchShape).optional() },
  },
  {
    name: "preview_lead_import",
    title: "Preview a CSV lead import",
    description:
      "Upload a CSV file and get back a header/column-mapping preview and row count, ahead of confirming the import. Provide the raw file bytes base64-encoded.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/leads/import/preview",
    requiredScope: "leads:manage",
    encode: "multipart",
    inputShape: {
      fileName: z.string().min(1),
      fileContentBase64: z.string().min(1).describe("The CSV file's raw bytes, base64-encoded"),
    },
    // Creates no lead rows, but does upload the file — and each call stores
    // it under a fresh storageKey, so it isn't idempotent either.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: {
      storageKey: z.string().optional(),
      fileName: z.string().optional(),
      headers: z.array(z.string()).optional(),
      suggestedMapping: z.record(z.string(), z.string().nullable()).optional(),
      totalRowCount: z.number().optional(),
      previewRows: z
        .array(
          z
            .object({
              rowNumber: z.number(),
              row: z.record(z.string(), z.string().optional()),
              errors: z.array(z.string()),
            })
            .partial()
            .passthrough(),
        )
        .optional(),
    },
  },
  {
    name: "confirm_lead_import",
    title: "Confirm a CSV lead import",
    description:
      "Confirm a previewed CSV import: creates/reuses a lead list and enqueues the import job.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/leads/import",
    requiredScope: "leads:manage",
    inputShape: {
      storageKey: z.string().min(1).describe("The storageKey returned by preview_lead_import"),
      fileName: z.string().min(1),
      columnMapping: z
        .record(z.string(), z.string().nullable())
        .describe("Maps each CSV column to a canonical lead field, or null to ignore it"),
      duplicateStrategy: z.enum(["SKIP", "UPDATE_BLANKS", "OVERWRITE", "REJECT", "ALLOW_SEPARATE"]),
      leadListName: z.string().min(1).max(120),
      leadListDescription: z.string().max(500).optional(),
    },
    // Not idempotent: the lead list is reused by name, but each call creates
    // another ImportBatch and re-runs the import.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: {
      id: z.string().optional(),
      status: z.string().optional(),
      leadList: z.object({ id: z.string(), name: z.string() }).partial().passthrough().optional(),
    },
  },
  {
    name: "get_lead_import_batch",
    title: "Get CSV import batch",
    description: "Get the status and details of a specific CSV import batch.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/leads/import/{batchId}",
    requiredScope: "profile",
    inputShape: { batchId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: { batch: importBatchShape.optional() },
  },
];
