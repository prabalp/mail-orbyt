import { loadEnv } from "@mail-orbyt/config";
import { z } from "zod";
import type { LinkToolDescriptor, RouteToolDescriptor } from "./registry.js";

const PLATFORMS = ["LINKEDIN", "TWITTER", "REDDIT", "INSTAGRAM", "THREADS"] as const;
const platformEnum = z.enum(PLATFORMS);

const ACTION_STATUSES = [
  "PENDING_POLICY_CHECK",
  "PENDING_HUMAN_APPROVAL",
  "APPROVED",
  "REJECTED_BY_POLICY",
  "REJECTED_BY_HUMAN",
  "DRY_RUN_SIMULATED",
  "PUBLISHED",
  "FAILED",
  "KILLED",
] as const;

const connectionShape = z
  .object({
    id: z.string(),
    platform: z.string(),
    externalHandle: z.string(),
    status: z.string(),
    lastSyncedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .partial()
  .passthrough();

const autonomyShape = z
  .object({
    id: z.string(),
    platform: z.string().nullable(),
    autonomyEnabled: z.boolean(),
    dryRunMode: z.boolean(),
    killSwitchActive: z.boolean(),
    maxActionsPerHour: z.number(),
    maxActionsPerDay: z.number(),
    requireApprovalBelowConfidence: z.number(),
  })
  .partial()
  .passthrough();

const ruleShape = z
  .object({
    id: z.string(),
    kind: z.string(),
    pattern: z.string(),
    isRegex: z.boolean(),
    platform: z.string().nullable(),
  })
  .partial()
  .passthrough();

const actionShape = z
  .object({
    id: z.string(),
    platform: z.string(),
    actionType: z.string(),
    status: z.string(),
    generatedContent: z.string(),
    policyConfidence: z.number().nullable(),
    policyDecision: z.string(),
    externalPostId: z.string().nullable(),
    failureReason: z.string().nullable(),
    createdAt: z.string(),
  })
  .partial()
  .passthrough();

const reviewNotes = z
  .string()
  .max(2000)
  .optional()
  .describe("Optional note recorded on the audit log.");

export const SOCIAL_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_social_connections",
    title: "List social accounts",
    description:
      "List the organisation's connected social accounts (LinkedIn, X, Reddit, Instagram, Threads) and which platforms this deployment has OAuth apps configured for. Use get_social_connect_url to connect a new one.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/social/connections",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      connections: z.array(connectionShape).optional(),
      configuredPlatforms: z.array(z.string()).optional(),
    },
  },
  {
    name: "disconnect_social_account",
    title: "Disconnect a social account",
    description:
      "Disconnect a social account. The social agent stops polling and posting for it; its audit history is kept.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/social/connections/{connectionId}",
    requiredScope: "social:manage",
    inputShape: { connectionId: z.string().min(1) },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_social_agent_settings",
    title: "Get social agent autonomy settings",
    description:
      "Get the social agent's autonomy settings: whether it may post on its own, dry-run mode, hourly/daily rate limits, the confidence threshold below which drafts escalate to human review, and whether the kill switch is active. A row with platform null is the org-wide default; a platform row overrides it for that platform. No rows means autonomy is off and dry-run is on.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/social/autonomy",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: { configs: z.array(autonomyShape).optional(), note: z.string().optional() },
  },
  {
    name: "update_social_agent_settings",
    title: "Update social agent autonomy settings",
    description:
      "Change the social agent's autonomy settings, org-wide (omit platform) or for one platform. Setting autonomyEnabled=true with dryRunMode=false lets the agent publish on its own whenever a draft passes every policy check — confirm with the user before doing that. Drafts that fail a check still escalate to human review.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/social/autonomy",
    requiredScope: "social:manage",
    inputShape: {
      platform: platformEnum.optional().describe("Omit for the org-wide default."),
      autonomyEnabled: z.boolean().optional(),
      dryRunMode: z
        .boolean()
        .optional()
        .describe("true = drafts are recorded as simulated, never published."),
      maxActionsPerHour: z.number().int().min(0).max(100).optional(),
      maxActionsPerDay: z.number().int().min(0).max(1000).optional(),
      requireApprovalBelowConfidence: z.number().min(0).max(1).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: autonomyShape.shape,
  },
  {
    name: "set_social_kill_switch",
    title: "Stop or resume the social agent",
    description:
      "Emergency stop (active=true) or resume (active=false) for the social agent's publishing — org-wide (omit platform) or for one platform. Takes effect immediately, including for posts already queued. Resuming the org-wide switch does not clear a platform-specific one; the response lists any still active.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/social/kill-switch",
    requiredScope: "social:kill_switch",
    inputShape: {
      active: z.boolean().describe("true stops publishing; false resumes it."),
      platform: platformEnum.optional().describe("Omit to apply to every platform."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: {
      config: autonomyShape.optional(),
      killSwitchStillActiveFor: z.array(z.string()).optional(),
    },
  },
  {
    name: "list_social_policy_rules",
    title: "List social policy rules",
    description:
      "List the guardrail rules every social draft is checked against (deterministic text matching, not AI).",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/social/policy-rules",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: { rules: z.array(ruleShape).optional() },
  },
  {
    name: "create_social_policy_rule",
    title: "Add a social policy rule",
    description:
      "Add a guardrail rule. BANNED_TOPIC/BANNED_PHRASE block any draft containing the pattern. REQUIRE_APPROVAL_KEYWORD forces human review. ALLOWED_TOPIC switches on allow-list mode: once any exist, drafts matching none of them are blocked. Matching is case-insensitive substring, or a regex when isRegex=true.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/social/policy-rules",
    requiredScope: "social:manage",
    inputShape: {
      kind: z.enum(["BANNED_TOPIC", "BANNED_PHRASE", "ALLOWED_TOPIC", "REQUIRE_APPROVAL_KEYWORD"]),
      pattern: z.string().min(1).max(500),
      isRegex: z.boolean().optional(),
      platform: platformEnum.optional().describe("Omit to apply on every platform."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    outputShape: ruleShape.shape,
  },
  {
    name: "delete_social_policy_rule",
    title: "Delete a social policy rule",
    description: "Delete a guardrail rule.",
    method: "DELETE",
    pathTemplate: "/api/organisations/{organisationId}/social/policy-rules/{ruleId}",
    requiredScope: "social:manage",
    inputShape: { ruleId: z.string().min(1) },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "list_social_actions",
    title: "List social agent actions",
    description:
      "List what the social agent drafted and what happened to each draft (the audit log): published, simulated in dry-run, blocked by policy, waiting for review, killed, or failed. Filter status=PENDING_HUMAN_APPROVAL for the review queue.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/social/actions",
    requiredScope: "profile",
    inputShape: {
      status: z.enum(ACTION_STATUSES).optional(),
      platform: platformEnum.optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: { actions: z.array(actionShape).optional() },
  },
  {
    name: "get_social_action",
    title: "Get a social agent action",
    description:
      "Get one social action in full: the draft, the exact prompt sent to the model, the policy evaluation (matched rules, rate-limit check, escalation reasons), and the inbound mention/comment that triggered it.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/social/actions/{actionId}",
    requiredScope: "profile",
    inputShape: { actionId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: actionShape.shape,
  },
  {
    name: "approve_social_action",
    title: "Approve an escalated social post",
    description:
      "Approve a draft waiting for human review so it publishes. Publishing publicly can't be undone — show the user the draft text and get their go-ahead first. It still passes the kill switch and rate limit before posting.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/social/actions/{actionId}/approve",
    requiredScope: "social:review",
    inputShape: { actionId: z.string().min(1), notes: reviewNotes },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "reject_social_action",
    title: "Reject an escalated social post",
    description:
      "Reject a draft waiting for human review. Rejected drafts are also fed back to the agent so it lowers its confidence on similar wording.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/social/actions/{actionId}/reject",
    requiredScope: "social:review",
    inputShape: { actionId: z.string().min(1), notes: reviewNotes },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "draft_social_post",
    title: "Draft a social post",
    description:
      "Have the social agent write a new post for a connected LinkedIn, X, or Threads account from a brief, then run it through the policy engine. Depending on the settings it is published, simulated (dry-run), queued for human review, or blocked — the response says which. It may publish immediately if autonomy is on and dry-run is off.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/social/posts",
    requiredScope: "social:manage",
    inputShape: {
      connectionId: z.string().min(1),
      brief: z.string().min(1).max(2000).describe("What the post should be about."),
      voiceInstructions: z.string().max(2000).optional().describe("Tone/style guidance."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    outputShape: {
      decision: z.string().optional(),
      validationViolations: z.array(z.string()).optional(),
      modelReasoning: z.string().optional(),
      action: actionShape.optional(),
    },
  },
];

export const SOCIAL_LINK_TOOLS: LinkToolDescriptor[] = [
  {
    name: "get_social_connect_url",
    title: "Get a social account connect link",
    description:
      "Get a link to open in a browser to connect a LinkedIn, X, Reddit, Instagram, or Threads account to this organisation. The connection only completes when a human opens it and approves the platform's consent screen while signed in to Mail Orbyt — this tool can't complete it alone.",
    requiredScope: "social:manage",
    inputShape: { platform: platformEnum },
    annotations: { readOnlyHint: true, openWorldHint: true },
    outputShape: { connectUrl: z.string().optional(), instructions: z.string().optional() },
    buildResult: (input, actor) => {
      const appUrl = loadEnv().APP_URL.replace(/\/$/, "");
      const platform = String(input.platform);
      const query = new URLSearchParams({ organisationId: actor.organisationId, platform });
      return JSON.stringify({
        connectUrl: `${appUrl}/api/social/oauth/start?${query.toString()}`,
        instructions: `Open this link in a browser signed in to Mail Orbyt. It redirects to ${platform}'s consent screen; approving it connects the account. New accounts start with autonomy off and dry-run on.`,
      });
    },
  },
];
