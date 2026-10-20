export type { EffectiveAutonomyConfig } from "./autonomy-config";
export { loadEffectiveAutonomyConfig } from "./autonomy-config";
export type { EscalationDecision, DecideEscalationInput } from "./escalation";
export { decideEscalation } from "./escalation";
export {
  checkAndThrowIfKilled,
  invalidateKillSwitchCache,
  isKillSwitchActive,
  KillSwitchActiveError,
} from "./kill-switch";
export type {
  EvaluateSocialActionDecision,
  EvaluateSocialActionInput,
  EvaluateSocialActionResult,
} from "./policy-service";
export { evaluateSocialAction } from "./policy-service";
export type { RateLimitStatus } from "./rate-limiter";
export { peekRateLimit, reserveRateLimit } from "./rate-limiter";
export type { MatchedRule, RuleEvaluationResult, RuleVerdict } from "./rule-engine";
export { evaluateContentAgainstRules } from "./rule-engine";
export { ALL_SOCIAL_PLATFORMS } from "./types";
export type { PolicyDecision, Sentiment, SocialActionKind, SocialPlatformName } from "./types";
