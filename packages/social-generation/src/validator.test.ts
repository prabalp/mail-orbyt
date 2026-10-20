import { describe, expect, it } from "vitest";
import { computeCompositeConfidence, validateSocialContent } from "./validator";
import type { GenerateSocialContentInput } from "./types";

const BASE_INPUT: GenerateSocialContentInput = {
  platform: "TWITTER",
  actionKind: "POST",
};

describe("validateSocialContent", () => {
  it("passes clean content unchanged", () => {
    const result = validateSocialContent(
      "A short, clean post about our product launch.",
      BASE_INPUT,
    );
    expect(result).toEqual({
      valid: true,
      fixedContent: "A short, clean post about our product launch.",
      requiredAutoFix: false,
      violations: [],
    });
  });

  it("auto-fixes (truncates) content over the platform length limit without rejecting it", () => {
    const longContent = "a".repeat(300);
    const result = validateSocialContent(longContent, BASE_INPUT);
    expect(result.requiredAutoFix).toBe(true);
    expect(result.fixedContent.length).toBeLessThanOrEqual(280);
    expect(result.fixedContent.endsWith("…")).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("respects a different platform's length limit", () => {
    const content = "a".repeat(400);
    const result = validateSocialContent(content, { ...BASE_INPUT, platform: "LINKEDIN" });
    expect(result.requiredAutoFix).toBe(false);
    expect(result.fixedContent).toBe(content);
  });

  it("rejects empty/whitespace-only content", () => {
    const result = validateSocialContent("   \n  ", BASE_INPUT);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("empty"))).toBe(true);
  });

  it("rejects content containing an unverified URL", () => {
    const result = validateSocialContent("Check this out: https://example.com/promo", BASE_INPUT);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("URL"))).toBe(true);
  });

  it("rejects content containing an email address", () => {
    const result = validateSocialContent("Reach us at hello@example.com anytime.", BASE_INPUT);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("email"))).toBe(true);
  });

  it("rejects content containing a phone number", () => {
    const result = validateSocialContent("Call us at 555-123-4567 today.", BASE_INPUT);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("phone"))).toBe(true);
  });

  it("rejects content containing a credit-card-like sequence", () => {
    const result = validateSocialContent("Card: 4111 1111 1111 1111 works great.", BASE_INPUT);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("credit-card"))).toBe(true);
  });

  it("flags but does not reject content matching a prior escalation phrase", () => {
    const result = validateSocialContent("We guarantee instant results every time.", BASE_INPUT, [
      "we guarantee instant results",
    ]);
    expect(result.violations.some((v) => v.includes("escalation"))).toBe(true);
    expect(result.valid).toBe(true);
  });
});

describe("computeCompositeConfidence", () => {
  it("returns the raw self-report when validation found nothing", () => {
    const confidence = computeCompositeConfidence(0.9, {
      valid: true,
      fixedContent: "ok",
      requiredAutoFix: false,
      violations: [],
    });
    expect(confidence).toBeCloseTo(0.9);
  });

  it("penalizes -0.3 when an auto-fix was required", () => {
    const confidence = computeCompositeConfidence(0.9, {
      valid: true,
      fixedContent: "ok",
      requiredAutoFix: true,
      violations: [],
    });
    expect(confidence).toBeCloseTo(0.6);
  });

  it("penalizes -0.4 when there are violations", () => {
    const confidence = computeCompositeConfidence(0.9, {
      valid: false,
      fixedContent: "ok",
      requiredAutoFix: false,
      violations: ["contains a URL"],
    });
    expect(confidence).toBeCloseTo(0.5);
  });

  it("stacks both penalties and clamps at 0", () => {
    const confidence = computeCompositeConfidence(0.5, {
      valid: false,
      fixedContent: "ok",
      requiredAutoFix: true,
      violations: ["contains a URL"],
    });
    expect(confidence).toBe(0);
  });

  it("clamps at 1 even with a self-report above 1", () => {
    const confidence = computeCompositeConfidence(1.5, {
      valid: true,
      fixedContent: "ok",
      requiredAutoFix: false,
      violations: [],
    });
    expect(confidence).toBe(1);
  });
});
