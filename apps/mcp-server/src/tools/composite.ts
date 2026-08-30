import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

const stepInputSchema = z.object({
  stepType: z.enum(["INITIAL", "FOLLOW_UP", "CLOSE_THE_LOOP"]),
  delayDays: z
    .number()
    .int()
    .min(0)
    .max(60)
    .optional()
    .describe("Days after the previous step — omit for the first step"),
  useAiGeneration: z
    .boolean()
    .optional()
    .describe(
      "Defaults to true. Set false and provide manualSubject/manualBody for hand-written copy",
    ),
  callToActionOverride: z.string().max(300).optional(),
  manualSubject: z.string().max(150).optional(),
  manualBody: z.string().max(4000).optional(),
});

const campaignFieldShape = {
  id: z.string(),
  name: z.string(),
  status: z.string(),
  timezone: z.string(),
  createdAt: z.string(),
};

/**
 * The tools that exist purely to collapse a long ID-juggling chain into one
 * call — every one of these calls an apps/web route that itself composes
 * several existing services (see create-server.ts's design note: the MCP
 * layer stays thin, the composition lives in the route).
 */
export const COMPOSITE_TOOLS: RouteToolDescriptor[] = [
  {
    name: "create_campaign_with_sequence",
    title: "Create a campaign with its full sequence",
    description:
      "Create a campaign, add its ordered sequence of steps, set its sending inbox pool, and optionally enroll a lead list or explicit leads — all in one call. This is the tool to use for 'set up a campaign' rather than chaining create_campaign, add_campaign_step, set_campaign_inboxes, and enroll_leads_in_campaign by hand. If anything after creation fails (an invalid step, an unusable inbox), the whole campaign is rolled back (archived) rather than left half-built.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/with-sequence",
    requiredScope: "campaigns:manage",
    inputShape: {
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone, e.g. America/New_York — defaults to UTC"),
      sendingDaysOfWeek: z
        .array(z.number().int().min(0).max(6))
        .optional()
        .describe("0=Sunday .. 6=Saturday"),
      sendingWindowStartMinute: z.number().int().min(0).max(1439).optional(),
      sendingWindowEndMinute: z.number().int().min(0).max(1439).optional(),
      inboxCooldownMinutes: z.number().int().min(0).max(180).optional(),
      emailPromptInstructions: z.string().max(4000).optional(),
      steps: z
        .array(stepInputSchema)
        .min(1)
        .max(20)
        .describe("In send order — this becomes each step's position in the sequence"),
      inboxIds: z
        .array(z.string().min(1))
        .optional()
        .describe("From list_inboxes — the sending pool for this campaign"),
      leadListId: z
        .string()
        .min(1)
        .optional()
        .describe("Enroll every lead in this list — provide at most one of leadListId or leadIds"),
      leadIds: z.array(z.string().min(1)).max(50000).optional(),
      activate: z
        .boolean()
        .optional()
        .describe(
          "Set the campaign live immediately once assembled — requires at least one step and one inbox",
        ),
    },
    // Creates a new campaign every call; never idempotent.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: {
      campaign: z.object(campaignFieldShape).partial().passthrough().optional(),
      enrollment: z
        .object({ enrolled: z.number(), alreadyEnrolled: z.number(), suppressed: z.number() })
        .partial()
        .passthrough()
        .nullable()
        .optional(),
    },
  },
  {
    name: "get_campaign_overview",
    title: "Get campaign overview",
    description:
      "One read covering a campaign's configuration, its ordered steps, enrollment counts by status, sending inbox pool, and headline stats (emails sent, reply rate, qualified meeting rate) — replaces chaining get_campaign, list_campaign_enrollments, and analytics for the same campaign.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/overview",
    requiredScope: "profile",
    inputShape: { campaignId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      campaign: z.object(campaignFieldShape).partial().passthrough().optional(),
      steps: z.array(z.record(z.string(), z.unknown())).optional(),
      inboxes: z.array(z.record(z.string(), z.unknown())).optional(),
      enrollments: z
        .object({ total: z.number(), byStatus: z.record(z.string(), z.number()) })
        .partial()
        .passthrough()
        .optional(),
      pendingSends: z
        .object({ count: z.number(), nextScheduledFor: z.string().nullable() })
        .partial()
        .passthrough()
        .optional(),
      // Null when the connection lacks analytics:view — see the route's permission gate.
      stats: z.record(z.string(), z.unknown()).nullable().optional(),
    },
  },
  {
    name: "get_org_overview",
    title: "Get organisation overview",
    description:
      "The default 'where do things stand' read: inbox count and DNS health, active campaigns, replies waiting on a human, active/suppressed lead counts, and qualified meeting rate. Use this first for any open-ended question about the organisation's state.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/overview",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      inboxes: z
        .object({
          total: z.number(),
          connected: z.number(),
          needingAttention: z.array(z.record(z.string(), z.unknown())),
          dailySendCapacity: z.number(),
        })
        .partial()
        .passthrough()
        .optional(),
      dns: z
        .object({
          checkedDomains: z.number(),
          unhealthyDomains: z.array(z.record(z.string(), z.unknown())),
        })
        .partial()
        .passthrough()
        .optional(),
      campaigns: z
        .object({
          total: z.number(),
          active: z.number(),
          byStatus: z.record(z.string(), z.number()),
          list: z.array(z.record(z.string(), z.unknown())),
        })
        .partial()
        .passthrough()
        .optional(),
      leads: z
        .object({ active: z.number(), suppressed: z.number() })
        .partial()
        .passthrough()
        .optional(),
      conversationsNeedingReview: z.number().nullable().optional(),
      analytics: z.record(z.string(), z.unknown()).nullable().optional(),
    },
  },
  {
    name: "retarget_leads",
    title: "Retarget leads into a campaign",
    description:
      "Enroll this organisation's retargetable pool — leads who finished a full sequence elsewhere without replying, and aren't currently mid-sequence anywhere — into this campaign. Pass dryRun to see who and how many would be enrolled before committing.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/retarget",
    requiredScope: "campaigns:manage",
    inputShape: {
      campaignId: z.string().min(1).describe("The campaign to enroll INTO"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview the pool and count without enrolling anyone"),
    },
    // Not idempotent: each real (non-dryRun) call enrolls whatever the
    // pool is at that moment, and a lead already enrolled here simply
    // won't be re-matched by the underlying predicate next time.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: {
      dryRun: z.boolean().optional(),
      wouldEnroll: z.number().optional(),
      leads: z
        .array(z.object({ id: z.string(), email: z.string() }).partial().passthrough())
        .optional(),
      enrolled: z.number().optional(),
      alreadyEnrolled: z.number().optional(),
      suppressed: z.number().optional(),
    },
  },
  {
    name: "find_lead",
    title: "Find a lead by name or email",
    description:
      "Resolve a lead's name or email address to their lead id and current status — the natural way to refer to a lead, since almost nobody carries a cuid around. Use this before any tool that needs a leadId when you only have a name or address. Returns every match, so check the count before assuming a single result.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/leads",
    requiredScope: "profile",
    inputShape: {
      search: z
        .string()
        .min(1)
        .describe(
          "A name, email address, or company — matched the same way the leads list search works",
        ),
      pageSize: z.coerce
        .number()
        .int()
        .positive()
        .max(50)
        .optional()
        .describe("Defaults to a small page — narrow the search text if this returns too many"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      leads: z
        .array(
          z
            .object({
              id: z.string(),
              firstName: z.string().nullable(),
              lastName: z.string().nullable(),
              email: z.string(),
              status: z.string(),
              companyId: z.string().nullable(),
            })
            .partial()
            .passthrough(),
        )
        .optional(),
      totalCount: z.number().optional(),
    },
  },
  {
    name: "connect_inbox",
    title: "Connect a sending inbox (guided)",
    description:
      "Start connecting a new Gmail sending inbox: returns the authorization link plus a plain-language checklist of what has to happen next (the user must be signed in to Mail Orbyt, approve Google's consent screen, and — once connected — have a DNS check run on their sending domain before enrolling anyone). This wraps get_gmail_connect_url with the guidance an assistant otherwise has to reconstruct itself; after the user says they've finished, poll get_inbox_connection_status to confirm.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/inboxes/connect-guide",
    requiredScope: "inboxes:manage",
    inputShape: {},
    // readOnlyHint: like get_gmail_connect_url, this only builds a link and a
    // checklist — nothing changes until a human approves Google's consent
    // screen. openWorldHint: true for the same reason (the link points at Google).
    annotations: { readOnlyHint: true, openWorldHint: true },
    outputShape: {
      connectUrl: z.string().optional(),
      steps: z.array(z.string()).optional(),
    },
  },
  {
    name: "get_inbox_connection_status",
    title: "Check inbox connection status",
    description:
      "Check whether a specific email address is now a connected sending inbox — the poll to run after handing the user a connect_inbox link and them saying they've finished. Reports 'not_found' if that address hasn't connected at all yet, distinct from a connected-but-unhealthy inbox.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/inboxes/connect-guide",
    requiredScope: "profile",
    inputShape: {
      emailAddress: z.string().email().describe("The Gmail address the user was connecting"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      status: z.enum(["connected", "needs_attention", "not_found"]).optional(),
      inbox: z
        .object({ id: z.string(), emailAddress: z.string(), status: z.string() })
        .partial()
        .passthrough()
        .nullable()
        .optional(),
    },
  },
  {
    name: "get_job_status",
    title: "Get job status",
    description:
      "Poll the status of queued work — research, keyword extraction, or CSV import — using the id returned when it was kicked off. Normalizes the three different underlying status shapes onto one: state is PENDING, RUNNING, COMPLETED, or FAILED, and done is true once it reaches COMPLETED or FAILED.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/jobs/{kind}/{jobId}",
    requiredScope: "profile",
    inputShape: {
      kind: z
        .enum(["research", "import", "keywords"])
        .describe(
          "research: from start_lead_research/start_company_research. import: from confirm_lead_import. keywords: from start_lead_research_keywords/start_company_research_keywords, keyed by researchSourceId",
        ),
      jobId: z.string().min(1),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      kind: z.string().optional(),
      id: z.string().optional(),
      state: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]).optional(),
      done: z.boolean().optional(),
      errorMessage: z.string().nullable().optional(),
      startedAt: z.string().nullable().optional(),
      completedAt: z.string().nullable().optional(),
      progress: z.record(z.string(), z.number()).optional(),
    },
  },
];
