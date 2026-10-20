import { recordAuditEvent } from "@mail-orbyt/authentication";
import type { PrismaClient, Prisma as PrismaNamespace } from "@mail-orbyt/database";
import type { Redis } from "ioredis";
import { loadEffectiveAutonomyConfig } from "./autonomy-config";
import { decideEscalation } from "./escalation";
import { peekRateLimit } from "./rate-limiter";
import { evaluateContentAgainstRules } from "./rule-engine";
import type { SocialActionKind, SocialPlatformName, Sentiment } from "./types";

type Prisma = Pick<
  PrismaClient,
  "socialPolicyRule" | "socialAutonomyConfig" | "socialAction" | "auditEvent"
>;

export interface EvaluateSocialActionInput {
  organisationId: string;
  connectionId: string;
  platform: SocialPlatformName;
  actionType: SocialActionKind;
  content: string;
  /** Composite confidence from packages/social-generation — never the model's raw self-report alone. */
  compositeConfidence: number;
  isFirstTimeContact: boolean;
  sentiment: Sentiment;
  /** Null for a proactive POST with no inbound trigger. */
  triggerEventId?: string;
  /** "webhook" | "poll" | "manual" | "scheduled-post" */
  triggerSource: string;
  generationPrompt: string;
  generationModel: string;
}

export type EvaluateSocialActionDecision = "ALLOW" | "ESCALATE" | "DENY" | "DRY_RUN";

export interface EvaluateSocialActionResult {
  /** The persisted SocialAction row id — the audit record for this candidate action. */
  actionId: string;
  decision: EvaluateSocialActionDecision;
}

/**
 * The single public entrypoint of the guardrail engine, and the only
 * function anywhere in the codebase allowed to decide whether AI-generated
 * social content may proceed toward publishing.
 *
 * ALWAYS persists a SocialAction row before returning — including a DENY —
 * so every candidate action, whether or not it ever posts, is fully
 * audited (generatedContent, generationPrompt, and the full policyEvaluation
 * are all recorded here, not just the outcome).
 *
 * Autonomy being disabled for the org/platform (including the fail-closed
 * "no config row exists" case) downgrades what would otherwise be an ALLOW
 * to ESCALATE — autonomy off means nothing auto-publishes, no matter how
 * clean the content is.
 *
 * When dry-run mode is on, an ALLOW is downgraded to the DRY_RUN decision
 * (persisted as DRY_RUN_SIMULATED) — the caller (the publish worker) must
 * treat this as a terminal, non-publishing state, not merely a slower path
 * to the same outcome.
 *
 * This function only PEEKS the rate limit (see rate-limiter.ts) to decide
 * whether to escalate — it never reserves/consumes a slot. The real,
 * consuming rate-limit check happens once, synchronously, in the publish
 * worker immediately before the live network call (see
 * apps/worker/src/queues/social-publish.ts), which is also where the kill
 * switch is re-checked for the same reason: a job can sit queued long
 * enough for either to have changed since this decision was made.
 */
export async function evaluateSocialAction(
  prisma: Prisma,
  redis: Redis,
  input: EvaluateSocialActionInput,
): Promise<EvaluateSocialActionResult> {
  const config = await loadEffectiveAutonomyConfig(prisma, input.organisationId, input.platform);

  const ruleResult = await evaluateContentAgainstRules(
    prisma,
    input.organisationId,
    input.platform,
    input.content,
  );
  const rateLimit = await peekRateLimit(
    redis,
    input.organisationId,
    input.platform,
    config.maxActionsPerHour,
    config.maxActionsPerDay,
  );

  const escalation = decideEscalation({
    ruleVerdict: ruleResult.verdict,
    compositeConfidence: input.compositeConfidence,
    isFirstTimeContact: input.isFirstTimeContact,
    sentiment: input.sentiment,
    actionType: input.actionType,
    requireApprovalBelowConfidence: config.requireApprovalBelowConfidence,
    rateLimitAllowed: rateLimit.allowed,
  });

  let decision: "ALLOW" | "ESCALATE" | "DENY" = escalation.decision;
  const reasons = [...escalation.reasons];
  if (decision === "ALLOW" && !config.autonomyEnabled) {
    decision = "ESCALATE";
    reasons.push("autonomy-disabled-for-org-or-platform");
  }

  const status =
    decision === "DENY"
      ? "REJECTED_BY_POLICY"
      : decision === "ESCALATE"
        ? "PENDING_HUMAN_APPROVAL"
        : config.dryRunMode
          ? "DRY_RUN_SIMULATED"
          : "APPROVED";

  // Structurally plain (strings/numbers/booleans/arrays) but built from
  // named interfaces rather than index-signature types, so Prisma's
  // InputJsonValue needs an explicit cast here rather than inferring it.
  const policyEvaluation = {
    rulesEvaluated: ruleResult.rulesEvaluated,
    matchedRules: ruleResult.matchedRules,
    ruleVerdict: ruleResult.verdict,
    rateLimitCheck: rateLimit,
    escalationReasons: reasons,
  } as unknown as PrismaNamespace.InputJsonValue;

  const action = await prisma.socialAction.create({
    data: {
      organisationId: input.organisationId,
      connectionId: input.connectionId,
      platform: input.platform,
      actionType: input.actionType,
      status,
      triggerEventId: input.triggerEventId,
      triggerSource: input.triggerSource,
      generatedContent: input.content,
      generationPrompt: input.generationPrompt,
      generationModel: input.generationModel,
      policyConfidence: input.compositeConfidence,
      policyEvaluation,
      policyDecision: decision,
    },
  });

  if (decision === "ESCALATE") {
    await recordAuditEvent(prisma, {
      type: "SOCIAL_ACTION_ESCALATED",
      organisationId: input.organisationId,
      metadata: {
        actionId: action.id,
        platform: input.platform,
        actionType: input.actionType,
        reasons,
      },
    });
  }

  return {
    actionId: action.id,
    decision: status === "DRY_RUN_SIMULATED" ? "DRY_RUN" : decision,
  };
}
