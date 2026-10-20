import type { PrismaClient } from "@mail-orbyt/database";
import type { SocialPlatformName } from "./types";

type Prisma = Pick<PrismaClient, "socialPolicyRule">;

export type RuleVerdict = "ALLOW" | "ESCALATE" | "DENY";

export interface MatchedRule {
  id: string;
  kind: string;
  pattern: string;
}

export interface RuleEvaluationResult {
  verdict: RuleVerdict;
  rulesEvaluated: number;
  matchedRules: MatchedRule[];
}

function matchesPattern(content: string, pattern: string, isRegex: boolean): boolean {
  if (isRegex) {
    try {
      return new RegExp(pattern, "i").test(content);
    } catch {
      // A malformed regex saved by an operator must never crash the
      // evaluation pipeline or silently let content through unchecked —
      // treat it as a non-match. Rule validity should be checked when the
      // rule is saved (settings UI), not here.
      return false;
    }
  }
  return content.toLowerCase().includes(pattern.toLowerCase());
}

/**
 * Deterministic string/regex matching against org-authored SocialPolicyRule
 * rows — plain code, zero LLM involvement. This is the actual enforcement
 * mechanism: the risk being guarded against is an LLM output going out
 * irreversibly, so the gate in front of it must not itself depend on
 * another LLM call that could be similarly fooled.
 *
 * BANNED_TOPIC / BANNED_PHRASE matches are an immediate, final DENY.
 * REQUIRE_APPROVAL_KEYWORD matches force ESCALATE (unless already DENYing).
 * If any ALLOWED_TOPIC rules exist for the org+platform, content must match
 * at least one of them or the action is DENYed (allow-list mode).
 */
export async function evaluateContentAgainstRules(
  prisma: Prisma,
  organisationId: string,
  platform: SocialPlatformName,
  content: string,
): Promise<RuleEvaluationResult> {
  const rules = await prisma.socialPolicyRule.findMany({
    where: { organisationId, OR: [{ platform: null }, { platform }] },
  });

  const allowedTopicRules = rules.filter((rule) => rule.kind === "ALLOWED_TOPIC");
  let matchedAllowedTopic = allowedTopicRules.length === 0;
  const matchedRules: MatchedRule[] = [];
  let verdict: RuleVerdict = "ALLOW";

  for (const rule of rules) {
    if (!matchesPattern(content, rule.pattern, rule.isRegex)) continue;

    matchedRules.push({ id: rule.id, kind: rule.kind, pattern: rule.pattern });

    if (rule.kind === "BANNED_TOPIC" || rule.kind === "BANNED_PHRASE") {
      verdict = "DENY";
    } else if (rule.kind === "REQUIRE_APPROVAL_KEYWORD" && verdict !== "DENY") {
      verdict = "ESCALATE";
    } else if (rule.kind === "ALLOWED_TOPIC") {
      matchedAllowedTopic = true;
    }
  }

  if (verdict !== "DENY" && !matchedAllowedTopic) {
    verdict = "DENY";
    matchedRules.push({
      id: "allow-list-miss",
      kind: "ALLOWED_TOPIC",
      pattern: "(no allow-listed topic matched)",
    });
  }

  return { verdict, rulesEvaluated: rules.length, matchedRules };
}
