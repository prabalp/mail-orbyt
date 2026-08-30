import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

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

const leadShape = z
  .object({
    id: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
    title: z.string().nullable(),
    status: z.string(),
    companyId: z.string().nullable(),
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

export const COMPANY_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_companies",
    title: "List companies",
    description: "List companies for the organisation, with pagination and search.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/companies",
    requiredScope: "profile",
    inputShape: {
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(200).optional(),
      search: z.string().optional().describe("Free-text search across company name/domain"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      companies: z.array(companyShape).optional(),
      totalCount: z.number().optional(),
    },
  },
  {
    name: "get_company",
    title: "Get company",
    description: "Get a single company, including its associated leads.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/companies/{companyId}",
    requiredScope: "profile",
    inputShape: { companyId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      company: companyShape.optional(),
      leads: z.array(leadShape).optional(),
    },
  },
  {
    name: "get_company_research",
    title: "Get company research state",
    description: "Get the current research job/state for a company's website research.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/companies/{companyId}/research",
    requiredScope: "profile",
    inputShape: { companyId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      facts: z.array(researchFactShape).optional(),
      latestJob: researchJobShape.nullable().optional(),
    },
  },
  {
    name: "start_company_research",
    title: "Start company research",
    description: "Kick off deterministic website/company research for a company.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/companies/{companyId}/research",
    requiredScope: "research:review",
    inputShape: { companyId: z.string().min(1) },
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
    name: "get_company_research_keywords",
    title: "Get company keyword-extraction state",
    description: "Get the keyword-extraction state for a company.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/companies/{companyId}/research/keywords",
    requiredScope: "profile",
    inputShape: { companyId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      available: z.boolean().optional(),
      latestRun: keywordRunShape.nullable().optional(),
      pageText: z.object({}).partial().passthrough().nullable().optional(),
    },
  },
  {
    name: "start_company_research_keywords",
    title: "Start company keyword extraction",
    description: "Start keyword extraction for a company (requires research to have already run).",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/companies/{companyId}/research/keywords",
    requiredScope: "research:review",
    inputShape: { companyId: z.string().min(1) },
    // Not idempotent: every call enqueues another extraction run.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: { researchSourceId: z.string().optional() },
  },
];
