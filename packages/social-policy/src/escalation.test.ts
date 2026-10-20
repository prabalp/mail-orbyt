import { describe, expect, it } from "vitest";
import { decideEscalation } from "./escalation";

const base = {
  ruleVerdict: "ALLOW" as const,
  compositeConfidence: 0.95,
  isFirstTimeContact: false,
  sentiment: "neutral" as const,
  actionType: "REPLY" as const,
  requireApprovalBelowConfidence: 0.85,
  rateLimitAllowed: true,
};

describe("decideEscalation", () => {
  it("allows clean, high-confidence, rate-limit-ok content", () => {
    expect(decideEscalation(base)).toEqual({ decision: "ALLOW", reasons: [] });
  });

  it("denies immediately on a rule DENY, ignoring every other signal", () => {
    const result = decideEscalation({ ...base, ruleVerdict: "DENY", compositeConfidence: 0.99 });
    expect(result.decision).toBe("DENY");
    expect(result.reasons).toEqual(["policy-rule-deny"]);
  });

  it("escalates on a rule ESCALATE (require-approval keyword)", () => {
    const result = decideEscalation({ ...base, ruleVerdict: "ESCALATE" });
    expect(result.decision).toBe("ESCALATE");
    expect(result.reasons).toContain("policy-rule-require-approval-keyword");
  });

  it("escalates when confidence is below the org's threshold", () => {
    const result = decideEscalation({ ...base, compositeConfidence: 0.5 });
    expect(result.decision).toBe("ESCALATE");
    expect(result.reasons).toContain("confidence-below-threshold");
  });

  it("escalates on first-time contact regardless of confidence", () => {
    const result = decideEscalation({
      ...base,
      isFirstTimeContact: true,
      compositeConfidence: 0.99,
    });
    expect(result.decision).toBe("ESCALATE");
    expect(result.reasons).toContain("first-time-contact");
  });

  it("escalates a negative-sentiment reply", () => {
    const result = decideEscalation({ ...base, sentiment: "negative", actionType: "REPLY" });
    expect(result.decision).toBe("ESCALATE");
    expect(result.reasons).toContain("negative-sentiment-reply");
  });

  it("does not escalate a negative-sentiment proactive POST (no one to offend by replying)", () => {
    const result = decideEscalation({ ...base, sentiment: "negative", actionType: "POST" });
    expect(result.decision).toBe("ALLOW");
  });

  it("escalates when the rate limit is exceeded rather than silently dropping", () => {
    const result = decideEscalation({ ...base, rateLimitAllowed: false });
    expect(result.decision).toBe("ESCALATE");
    expect(result.reasons).toContain("rate-limit-exceeded");
  });
});
