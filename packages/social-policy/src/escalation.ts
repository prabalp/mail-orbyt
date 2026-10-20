import type { RuleVerdict } from "./rule-engine";
import type { SocialActionKind, Sentiment } from "./types";

export interface DecideEscalationInput {
  ruleVerdict: RuleVerdict;
  /** Composite confidence from packages/social-generation — never the model's raw self-report alone. */
  compositeConfidence: number;
  isFirstTimeContact: boolean;
  sentiment: Sentiment;
  actionType: SocialActionKind;
  requireApprovalBelowConfidence: number;
  rateLimitAllowed: boolean;
}

export interface EscalationDecision {
  decision: "ALLOW" | "ESCALATE" | "DENY";
  reasons: string[];
}

/**
 * Composes the rule engine's verdict with the other escalation signals.
 * A DENY from the deterministic rule engine is final and short-circuits
 * everything below it — nothing here can turn a DENY back into an ALLOW.
 * Every other signal is additive: any one of them present is enough to
 * force ESCALATE, since the risk (a bad post going out publicly and
 * irreversibly) is asymmetric — a false escalation costs a human a minute
 * of review, a false ALLOW cannot be undone.
 */
export function decideEscalation(input: DecideEscalationInput): EscalationDecision {
  if (input.ruleVerdict === "DENY") {
    return { decision: "DENY", reasons: ["policy-rule-deny"] };
  }

  const reasons: string[] = [];
  if (input.ruleVerdict === "ESCALATE") reasons.push("policy-rule-require-approval-keyword");
  if (!input.rateLimitAllowed) reasons.push("rate-limit-exceeded");
  if (input.compositeConfidence < input.requireApprovalBelowConfidence) {
    reasons.push("confidence-below-threshold");
  }
  if (input.isFirstTimeContact) reasons.push("first-time-contact");
  if (
    input.sentiment === "negative" &&
    (input.actionType === "REPLY" || input.actionType === "DM_REPLY")
  ) {
    reasons.push("negative-sentiment-reply");
  }

  return { decision: reasons.length > 0 ? "ESCALATE" : "ALLOW", reasons };
}
