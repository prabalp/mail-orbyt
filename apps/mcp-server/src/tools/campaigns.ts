import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

const campaignScheduleFields = {
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  timezone: z.string().optional(),
  sendingDaysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  sendingWindowStartMinute: z.number().int().min(0).max(1439).optional(),
  sendingWindowEndMinute: z.number().int().min(0).max(1439).optional(),
  inboxCooldownMinutes: z.number().int().min(0).max(180).optional(),
};

const campaignStepFields = {
  delayDays: z.number().int().min(0).max(60).optional(),
  useAiGeneration: z.boolean().optional(),
  callToActionOverride: z.string().max(300).optional(),
  stepInstructions: z.string().max(1000).optional(),
  manualSubject: z.string().max(150).optional(),
  manualBody: z.string().max(4000).optional(),
};

/** The campaign row as apps/web serialises it — dates arrive as ISO strings. */
const campaignOutputFields = {
  id: z.string().optional(),
  organisationId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  timezone: z.string().optional(),
  sendingDaysOfWeek: z.array(z.number()).optional(),
  sendingWindowStartMinute: z.number().optional(),
  sendingWindowEndMinute: z.number().optional(),
  inboxCooldownMinutes: z.number().optional(),
  emailPromptInstructions: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
};

const campaignShape = z.object(campaignOutputFields).partial().passthrough();

const stepOutputFields = {
  id: z.string().optional(),
  campaignId: z.string().optional(),
  orderIndex: z.number().optional(),
  stepType: z.string().optional(),
  delayDays: z.number().optional(),
  useAiGeneration: z.boolean().optional(),
  callToActionOverride: z.string().nullable().optional(),
  stepInstructions: z.string().nullable().optional(),
  manualSubject: z.string().nullable().optional(),
  manualBody: z.string().nullable().optional(),
};

const stepShape = z.object(stepOutputFields).partial().passthrough();

const leadShape = z
  .object({
    id: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
    title: z.string().nullable(),
    status: z.string(),
    companyId: z.string().nullable(),
  })
  .partial()
  .passthrough();

/** A CampaignInbox join row with its Inbox eagerly included. */
const campaignInboxShape = z
  .object({
    id: z.string(),
    campaignId: z.string(),
    inboxId: z.string(),
    inbox: z
      .object({
        id: z.string(),
        emailAddress: z.string(),
        displayName: z.string().nullable(),
        status: z.string(),
      })
      .partial()
      .passthrough(),
  })
  .partial()
  .passthrough();

const enrollmentOutputFields = {
  id: z.string().optional(),
  campaignId: z.string().optional(),
  leadId: z.string().optional(),
  status: z.string().optional(),
  currentStepIndex: z.number().optional(),
  lastStepSentAt: z.string().nullable().optional(),
  exitReason: z.string().nullable().optional(),
  enrolledAt: z.string().optional(),
  exitedAt: z.string().nullable().optional(),
};

/** Listed enrollments carry their Lead; the single-enrollment write does not. */
const enrollmentShape = z
  .object({ ...enrollmentOutputFields, lead: leadShape })
  .partial()
  .passthrough();

export const CAMPAIGN_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_campaigns",
    title: "List campaigns",
    description: "List campaigns for the organisation.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/campaigns",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    // Archived campaigns are excluded by the route.
    outputShape: { campaigns: z.array(campaignShape).optional() },
  },
  {
    name: "create_campaign",
    title: "Create campaign",
    description: "Create a new outbound email campaign.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/campaigns",
    requiredScope: "campaigns:manage",
    inputShape: { ...campaignScheduleFields },
    // Creates a new row every call, so never idempotent.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: { ...campaignOutputFields },
  },
  {
    name: "get_campaign",
    title: "Get campaign",
    description: "Get a single campaign's details.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}",
    requiredScope: "profile",
    inputShape: { campaignId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      ...campaignOutputFields,
      steps: z.array(stepShape).optional(),
      inboxes: z.array(campaignInboxShape).optional(),
      enrollments: z.array(z.object({ status: z.string() }).partial().passthrough()).optional(),
      // When the next queued email actually goes out — a saved sending window
      // alone says nothing about already-scheduled items.
      pendingSends: z
        .object({ count: z.number(), nextScheduledFor: z.string().nullable() })
        .partial()
        .passthrough()
        .optional(),
      defaultCampaignPrompt: z.string().optional(),
    },
  },
  {
    name: "update_campaign",
    title: "Update campaign",
    description: "Update a campaign's settings, prompt instructions, or status.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}",
    requiredScope: "campaigns:manage",
    inputShape: {
      campaignId: z.string().min(1),
      name: campaignScheduleFields.name.optional(),
      description: campaignScheduleFields.description,
      timezone: campaignScheduleFields.timezone,
      sendingDaysOfWeek: campaignScheduleFields.sendingDaysOfWeek,
      sendingWindowStartMinute: campaignScheduleFields.sendingWindowStartMinute,
      sendingWindowEndMinute: campaignScheduleFields.sendingWindowEndMinute,
      inboxCooldownMinutes: campaignScheduleFields.inboxCooldownMinutes,
      emailPromptInstructions: z
        .string()
        .max(4000)
        .optional()
        .describe("Campaign-specific AI prompt instructions — pass an empty string to clear it"),
      status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: { ...campaignOutputFields },
  },
  {
    name: "archive_campaign",
    title: "Archive campaign",
    description: "Archive a campaign.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}",
    requiredScope: "campaigns:manage",
    inputShape: { campaignId: z.string().min(1) },
    // Not destructive: archiving only sets status=ARCHIVED, and
    // update_campaign can move it back out again. Nothing is deleted.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: { ...campaignOutputFields },
  },
  {
    name: "add_campaign_step",
    title: "Add campaign step",
    description: "Add a new step (email touch) to a campaign's sequence.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/steps",
    requiredScope: "campaigns:manage",
    inputShape: {
      campaignId: z.string().min(1),
      stepType: z.enum(["INITIAL", "FOLLOW_UP", "CLOSE_THE_LOOP"]),
      ...campaignStepFields,
    },
    // Appends a step each call — calling twice adds two touches.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: { ...stepOutputFields },
  },
  {
    name: "reorder_campaign_steps",
    title: "Reorder campaign steps",
    description: "Reorder a campaign's steps.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/steps",
    requiredScope: "campaigns:manage",
    inputShape: {
      campaignId: z.string().min(1),
      orderedStepIds: z.array(z.string().min(1)),
    },
    // The same ordering applied twice leaves the same orderIndex values.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: { steps: z.array(stepShape).optional() },
  },
  {
    name: "update_campaign_step",
    title: "Update campaign step",
    description: "Update a single campaign step.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/steps/{stepId}",
    requiredScope: "campaigns:manage",
    inputShape: {
      campaignId: z.string().min(1),
      stepId: z.string().min(1),
      ...campaignStepFields,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: { ...stepOutputFields },
  },
  {
    name: "delete_campaign_step",
    title: "Delete campaign step",
    description: "Delete a step from a campaign's sequence.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/steps/{stepId}",
    requiredScope: "campaigns:manage",
    inputShape: {
      campaignId: z.string().min(1),
      stepId: z.string().min(1),
    },
    // A hard delete of the row, including its manual subject/body — there is
    // no undo, only re-authoring the step.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "list_campaign_enrollments",
    title: "List campaign enrollments",
    description: "List leads enrolled in a campaign.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/enrollments",
    requiredScope: "profile",
    inputShape: { campaignId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: { enrollments: z.array(enrollmentShape).optional() },
  },
  {
    name: "enroll_leads_in_campaign",
    title: "Enroll leads in campaign",
    description:
      "Enroll leads in a campaign — an explicit list of lead IDs, a set of lead email addresses, or an entire lead list. Provide exactly one of the three.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/enrollments",
    requiredScope: "campaigns:manage",
    inputShape: {
      campaignId: z.string().min(1),
      leadIds: z
        .array(z.string().min(1))
        .min(1)
        .optional()
        .describe("Explicit lead IDs — provide exactly one of leadIds, leadEmails, or leadListId"),
      leadEmails: z
        .array(z.string().email())
        .min(1)
        .max(5000)
        .optional()
        .describe(
          "Lead email addresses, resolved to ids server-side — provide exactly one of leadIds, leadEmails, or leadListId. The natural choice when you don't already have a leadId (see find_lead).",
        ),
      leadListId: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Enroll every lead in this lead list — provide exactly one of leadIds, leadEmails, or leadListId",
        ),
    },
    // Not idempotent: it creates enrollment rows, and a second call reports
    // the same leads under alreadyEnrolled rather than repeating the work.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: {
      enrolled: z.number().optional(),
      alreadyEnrolled: z.number().optional(),
      // Enrolled but unreachable: already on the do-not-contact list.
      suppressed: z.number().optional(),
    },
  },
  {
    name: "unenroll_lead_from_campaign",
    title: "Remove a lead from a campaign",
    description: "Remove a lead from a campaign's enrollment.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/enrollments/{leadId}",
    requiredScope: "campaigns:manage",
    inputShape: {
      campaignId: z.string().min(1),
      leadId: z.string().min(1),
      reason: z.string().max(300).optional(),
    },
    // Not destructive: the enrollment is marked EXITED, not deleted — the
    // row, its reason and its history all survive.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: { ...enrollmentOutputFields },
  },
  {
    name: "set_campaign_inboxes",
    title: "Set campaign sending inboxes",
    description: "Replace the full set of sending inboxes used by a campaign.",
    method: "PUT",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/inboxes",
    requiredScope: "campaigns:manage",
    inputShape: {
      campaignId: z.string().min(1),
      inboxIds: z
        .array(z.string().min(1))
        .describe("The full replacement sending-inbox pool for this campaign"),
    },
    // A whole-pool replacement: sending the same inboxIds again leaves the
    // same pool. Nothing but the join rows is touched, so not destructive.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: { pool: z.array(campaignInboxShape).optional() },
  },
  {
    name: "list_campaign_retargetable_leads",
    title: "List retargetable leads",
    description: "List leads eligible for retargeting in this campaign.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/retargetable-leads",
    requiredScope: "profile",
    inputShape: { campaignId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: { leads: z.array(leadShape).optional() },
  },
  {
    name: "force_send_campaign_now",
    title: "Force campaign send now",
    description:
      "Force the campaign's next scheduled send to run immediately, bypassing its sending window. Blocked in production — only usable against non-production environments for testing.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/send-now",
    requiredScope: "campaigns:manage",
    inputShape: { campaignId: z.string().min(1) },
    // Destructive because it delivers real email to real prospects: there is
    // no unsend, and the send is visible outside the product the instant it
    // lands. Not idempotent either — each call drains whatever is due now.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: {
      considered: z.number().optional(),
      sent: z.number().optional(),
      failed: z.number().optional(),
      skipped: z.number().optional(),
      // Still queued after the run: held back by the per-inbox cooldown.
      deferred: z.number().optional(),
    },
  },
  {
    name: "send_campaign_test",
    title: "Send campaign test email",
    description: "Send a test rendering of this campaign's next email to one or two addresses.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/campaigns/{campaignId}/send-test",
    requiredScope: "campaigns:manage",
    inputShape: {
      campaignId: z.string().min(1),
      emails: z.array(z.string().email()).min(1).max(2),
    },
    // Destructive for the same reason as force_send_campaign_now: it puts
    // real mail in a real mailbox and cannot be unsent. It touches no
    // prospect data, but the outward effect is still irreversible.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: {
      subject: z.string().optional(),
      body: z.string().optional(),
      results: z
        .array(
          z
            .object({ email: z.string(), ok: z.boolean(), error: z.string() })
            .partial()
            .passthrough(),
        )
        .optional(),
    },
  },
];
